import { AppointmentStatus, Attendance, DepositStatus, InquiryStatus } from "@prisma/client";
import { prisma } from "../db";
import { formatSlotLabel } from "../time";
import { audit } from "../audit";
import { assertSlotFree, mapBookingConflict } from "./availability";
import { cancelPendingStallFollowUps } from "./followups";
import { enqueueOutbound } from "./outbox";

async function snapshotValue(inquiryId: string, treatmentId: string | null) {
  const inquiry = await prisma.inquiry.findUniqueOrThrow({
    where: { id: inquiryId },
    include: { clinic: true, qualification: { include: { treatment: true } } },
  });
  const treatment = treatmentId
    ? await prisma.treatment.findUnique({ where: { id: treatmentId } })
    : inquiry.qualification?.treatment;
  const value =
    treatment?.estimatedValueMad ??
    inquiry.clinic.defaultConsultationValueMad ??
    null;
  return value;
}

async function scheduleReminders(appointmentId: string, clinicId: string, startAt: Date, createdAt = new Date()) {
  const kinds = [
    { kind: "t24h" as const, at: new Date(startAt.getTime() - 24 * 60 * 60 * 1000) },
    { kind: "t2h" as const, at: new Date(startAt.getTime() - 2 * 60 * 60 * 1000) },
  ];
  for (const k of kinds) {
    if (k.at <= createdAt) {
      await prisma.reminder.create({
        data: {
          clinicId,
          appointmentId,
          kind: k.kind,
          scheduledAt: k.at,
          canceledAt: new Date(),
          skipReason: "past",
        },
      });
    } else {
      await prisma.reminder.create({
        data: {
          clinicId,
          appointmentId,
          kind: k.kind,
          scheduledAt: k.at,
        },
      });
    }
  }
}

async function cancelReminders(appointmentId: string) {
  await prisma.reminder.updateMany({
    where: { appointmentId, sentAt: null, canceledAt: null },
    data: { canceledAt: new Date() },
  });
}

function confirmationBody(clinicName: string, start: Date, end: Date) {
  return `Votre consultation à ${clinicName} est confirmée : ${formatSlotLabel(start, end)} (heure du Maroc). Répondez à ce message si vous devez modifier le rendez-vous.`;
}

export async function bookAppointment(args: {
  clinicId: string;
  inquiryId: string;
  startAt: Date;
  endAt: Date;
  userId: string | null;
  notes?: string;
  byAi?: boolean;
}) {
  const inquiry = await prisma.inquiry.findUniqueOrThrow({
    where: { id: args.inquiryId },
    include: { contact: true, conversation: true, clinic: true, qualification: true },
  });
  if (inquiry.clinicId !== args.clinicId) throw new Error("TENANT");
  if (inquiry.clinic.status === "onboarding" && !args.userId) throw new Error("CLINIC_NOT_ACTIVE");

  const value = await snapshotValue(inquiry.id, inquiry.qualification?.treatmentId ?? null);

  let appointment;
  try {
    appointment = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM clinics WHERE id = ${args.clinicId}::uuid FOR UPDATE`;
      const existing = await tx.appointment.findFirst({
        where: { contactId: inquiry.contactId, status: "scheduled" },
      });
      if (existing) throw new Error("ALREADY_SCHEDULED");
      await assertSlotFree(args.clinicId, args.startAt, args.endAt, undefined, tx);
      const appt = await tx.appointment.create({
        data: {
          clinicId: args.clinicId,
          inquiryId: inquiry.id,
          contactId: inquiry.contactId,
          startAt: args.startAt,
          endAt: args.endAt,
          status: AppointmentStatus.scheduled,
          notes: args.notes ?? "",
        },
      });
      await tx.inquiry.update({
        where: { id: inquiry.id },
        data: {
          status: InquiryStatus.booked,
          bookedAt: inquiry.bookedAt ?? new Date(),
          estimatedValueMad: value,
        },
      });
      return appt;
    });
  } catch (err) {
    throw mapBookingConflict(err);
  }

  await scheduleReminders(appointment.id, args.clinicId, args.startAt);
  await cancelPendingStallFollowUps(inquiry.id);

  await enqueueOutbound({
    clinicId: args.clinicId,
    conversationId: inquiry.conversationId,
    inquiryId: inquiry.id,
    senderType: "system",
    body: confirmationBody(inquiry.clinic.name, args.startAt, args.endAt),
    templateName: "appointment_confirmation",
  });

  await audit({
    clinicId: args.clinicId,
    userId: args.userId,
    action: args.byAi ? "appointment_create_ai" : "appointment_create",
    entityType: "appointment",
    entityId: appointment.id,
  });

  return appointment;
}

export async function rescheduleAppointment(args: {
  clinicId: string;
  appointmentId: string;
  startAt: Date;
  endAt: Date;
  userId: string;
}) {
  const old = await prisma.appointment.findUniqueOrThrow({
    where: { id: args.appointmentId },
    include: { inquiry: { include: { clinic: true, conversation: true } } },
  });
  if (old.clinicId !== args.clinicId) throw new Error("TENANT");
  if (old.status !== "scheduled") throw new Error("NOT_SCHEDULED");

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM clinics WHERE id = ${args.clinicId}::uuid FOR UPDATE`;
      const current = await tx.appointment.findUniqueOrThrow({ where: { id: old.id } });
      if (current.status !== "scheduled") throw new Error("NOT_SCHEDULED");

      await assertSlotFree(args.clinicId, args.startAt, args.endAt, old.id, tx);

      await tx.appointment.update({
        where: { id: old.id },
        data: { status: AppointmentStatus.rescheduled },
      });

      const next = await tx.appointment.create({
        data: {
          clinicId: args.clinicId,
          inquiryId: old.inquiryId,
          contactId: old.contactId,
          startAt: args.startAt,
          endAt: args.endAt,
          status: AppointmentStatus.scheduled,
          depositStatus: old.depositStatus,
          depositAmountMad: old.depositAmountMad,
          depositedAt: old.depositedAt,
          markedByUserId: old.markedByUserId,
          notes: old.notes,
        },
      });

      await tx.appointment.update({
        where: { id: old.id },
        data: { supersededByAppointmentId: next.id },
      });
      return next;
    });
  } catch (err) {
    throw mapBookingConflict(err);
  }

  await cancelReminders(old.id);
  await scheduleReminders(created.id, args.clinicId, args.startAt);

  await enqueueOutbound({
    clinicId: args.clinicId,
    conversationId: old.inquiry.conversationId,
    inquiryId: old.inquiryId,
    senderType: "system",
    body: confirmationBody(old.inquiry.clinic.name, args.startAt, args.endAt),
    templateName: "appointment_confirmation",
  });

  await audit({
    clinicId: args.clinicId,
    userId: args.userId,
    action: "appointment_reschedule",
    entityType: "appointment",
    entityId: created.id,
  });
  return created;
}

export async function cancelAppointment(args: {
  clinicId: string;
  appointmentId: string;
  userId: string;
  note?: string;
}) {
  const appt = await prisma.appointment.findUniqueOrThrow({
    where: { id: args.appointmentId },
    include: { inquiry: { include: { clinic: true, conversation: true } }, contact: true },
  });
  if (appt.clinicId !== args.clinicId) throw new Error("TENANT");
  if (appt.status !== "scheduled") throw new Error("NOT_SCHEDULED");

  const wasConfirmed = Boolean(appt.confirmationSentAt);

  await prisma.appointment.update({
    where: { id: appt.id },
    data: {
      status: AppointmentStatus.cancelled,
      notes: args.note ? `${appt.notes}\n${args.note}`.trim() : appt.notes,
    },
  });
  await cancelReminders(appt.id);

  const other = await prisma.appointment.findFirst({
    where: { contactId: appt.contactId, status: "scheduled" },
  });
  if (!other) {
    await prisma.inquiry.update({
      where: { id: appt.inquiryId },
      data: { status: InquiryStatus.open },
    });
  }

  if (wasConfirmed) {
    const when = formatSlotLabel(appt.startAt, appt.endAt);
    await enqueueOutbound({
      clinicId: args.clinicId,
      conversationId: appt.inquiry.conversationId,
      inquiryId: appt.inquiryId,
      senderType: "system",
      body: `Votre rendez-vous à ${appt.inquiry.clinic.name} (${when}) a été annulé. Répondez si vous souhaitez reprogrammer.`,
      templateName: "appointment_cancelled",
    });
  }

  await audit({
    clinicId: args.clinicId,
    userId: args.userId,
    action: "appointment_cancel",
    entityType: "appointment",
    entityId: appt.id,
  });
}

export async function markDeposit(args: {
  clinicId: string;
  appointmentId: string;
  userId: string;
  deposited: boolean;
  amountMad?: number | null;
}) {
  const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: args.appointmentId } });
  if (appt.clinicId !== args.clinicId) throw new Error("TENANT");
  await prisma.appointment.update({
    where: { id: appt.id },
    data: args.deposited
      ? {
          depositStatus: DepositStatus.deposited,
          depositAmountMad: args.amountMad ?? appt.depositAmountMad,
          depositedAt: appt.depositedAt ?? new Date(),
          markedByUserId: args.userId,
        }
      : {
          depositStatus: DepositStatus.none,
          depositedAt: null,
          markedByUserId: args.userId,
        },
  });
  await audit({
    clinicId: args.clinicId,
    userId: args.userId,
    action: args.deposited ? "deposit_mark" : "deposit_unmark",
    entityType: "appointment",
    entityId: appt.id,
    metadata: { amountMad: args.amountMad ?? null },
  });
}

export async function markAttendance(args: {
  clinicId: string;
  appointmentId: string;
  userId: string;
  attendance: Attendance;
}) {
  const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: args.appointmentId } });
  if (appt.clinicId !== args.clinicId) throw new Error("TENANT");
  if (args.attendance === "no_show" && new Date() < appt.startAt) {
    throw new Error("NO_SHOW_BEFORE_START");
  }
  await prisma.appointment.update({
    where: { id: appt.id },
    data: { attendance: args.attendance, markedByUserId: args.userId },
  });
  await audit({
    clinicId: args.clinicId,
    userId: args.userId,
    action: "attendance_mark",
    entityType: "appointment",
    entityId: appt.id,
    metadata: { attendance: args.attendance },
  });
}
