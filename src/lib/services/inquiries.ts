import { ClosedReason, InquirySource, InquiryStatus, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { normalizePhoneE164 } from "../phone";
import { applyQualificationPatch, computeQualificationStatus, shouldAutoClose, type QualificationInput } from "../qualification";
import { audit } from "../audit";
import { cancelPendingStallFollowUps, scheduleNextStallFollowUp } from "./followups";
import { enqueueOutbound } from "./outbox";

export async function createManualInquiry(args: {
  clinicId: string;
  userId: string;
  phone: string;
  name?: string;
  note?: string;
  sendWhatsApp?: boolean;
  body?: string;
}) {
  const phone = normalizePhoneE164(args.phone);
  if (!phone) throw new Error("INVALID_PHONE");
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: args.clinicId } });

  const contact = await prisma.contact.upsert({
    where: { clinicId_phoneE164: { clinicId: args.clinicId, phoneE164: phone } },
    create: { clinicId: args.clinicId, phoneE164: phone, name: args.name?.trim() || null },
    update: {
      name: args.name?.trim() ? args.name.trim() : undefined,
    },
  });

  let conversation = await prisma.conversation.findUnique({ where: { contactId: contact.id } });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        clinicId: args.clinicId,
        contactId: contact.id,
        mode: clinic.status === "active" ? "ai" : "human",
      },
    });
  }

  let inquiry = await prisma.inquiry.findFirst({
    where: { contactId: contact.id, status: { in: ["open", "booked"] } },
  });
  if (!inquiry) {
    inquiry = await prisma.inquiry.create({
      data: {
        clinicId: args.clinicId,
        contactId: contact.id,
        conversationId: conversation.id,
        source: InquirySource.manual,
        status: InquiryStatus.open,
        qualification: { create: { clinicId: args.clinicId } },
      },
    });
  }

  if (args.note) {
    await prisma.qualification.update({
      where: { inquiryId: inquiry.id },
      data: { notes: args.note },
    });
  }

  if (args.sendWhatsApp && args.body) {
    await enqueueOutbound({
      clinicId: args.clinicId,
      conversationId: conversation.id,
      inquiryId: inquiry.id,
      senderType: "staff",
      staffUserId: args.userId,
      body: args.body,
    });
  }

  await audit({
    clinicId: args.clinicId,
    userId: args.userId,
    action: "inquiry_manual_create",
    entityType: "inquiry",
    entityId: inquiry.id,
  });

  return { inquiry, conversation };
}

export async function closeInquiry(args: {
  clinicId: string;
  inquiryId: string;
  userId: string;
  reason: ClosedReason;
}) {
  const inquiry = await prisma.inquiry.findUniqueOrThrow({
    where: { id: args.inquiryId },
    include: { appointments: true },
  });
  if (inquiry.clinicId !== args.clinicId) throw new Error("TENANT");
  const future = inquiry.appointments.some(
    (a) => a.status === "scheduled" && a.startAt > new Date(),
  );
  if (inquiry.status === "booked" && future) throw new Error("HAS_SCHEDULED_APPOINTMENT");

  await prisma.inquiry.update({
    where: { id: inquiry.id },
    data: { status: InquiryStatus.closed, closedReason: args.reason },
  });
  await cancelPendingStallFollowUps(inquiry.id);
}

export async function staffUpdateQualification(args: {
  clinicId: string;
  inquiryId: string;
  userId: string;
  patch: Partial<QualificationInput>;
}) {
  const q = await prisma.qualification.findUniqueOrThrow({
    where: { inquiryId: args.inquiryId },
    include: { inquiry: true },
  });
  if (q.inquiry.clinicId !== args.clinicId) throw new Error("TENANT");
  const current: QualificationInput = {
    status: q.status,
    treatmentId: q.treatmentId,
    treatmentLabel: q.treatmentLabel,
    intent: q.intent,
    canAttendClinic: q.canAttendClinic,
    disqualifyReason: q.disqualifyReason,
    notes: q.notes,
    lockedByStaff: q.lockedByStaff,
  };
  const next = applyQualificationPatch(current, { ...args.patch, lockedByStaff: true }, { byStaff: true });
  await persistQualification(args.inquiryId, args.clinicId, next, args.userId);
}

export async function persistQualification(
  inquiryId: string,
  clinicId: string,
  next: QualificationInput,
  userId: string | null,
) {
  const previous = await prisma.qualification.findUniqueOrThrow({ where: { inquiryId } });
  const status = computeQualificationStatus(next);
  await prisma.qualification.update({
    where: { inquiryId },
    data: {
      status,
      treatmentId: next.treatmentId,
      treatmentLabel: next.treatmentLabel,
      intent: next.intent,
      canAttendClinic: next.canAttendClinic,
      disqualifyReason: next.disqualifyReason,
      notes: next.notes,
      lockedByStaff: next.lockedByStaff,
    },
  });
  if (status === "qualified") {
    await prisma.inquiry.updateMany({
      where: { id: inquiryId, qualifiedAt: null },
      data: { qualifiedAt: new Date() },
    });
  }
  if (status === "disqualified") {
    await cancelPendingStallFollowUps(inquiryId);
    if (shouldAutoClose(next.disqualifyReason)) {
      await prisma.inquiry.update({
        where: { id: inquiryId },
        data: {
          status: InquiryStatus.closed,
          closedReason: next.disqualifyReason === "spam" ? "spam" : "other",
        },
      });
    }
  } else {
    await scheduleNextStallFollowUp(inquiryId);
  }
  if (userId) {
    await audit({
      clinicId,
      userId,
      action: "qualification_override",
      entityType: "qualification",
      entityId: inquiryId,
      metadata: { status } as Prisma.InputJsonValue,
    });
  }
  void previous;
}
