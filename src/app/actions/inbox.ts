"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ClosedReason, Intent, CanAttend, DisqualifyReason } from "@prisma/client";
import { requireClinic } from "@/lib/tenancy";
import { staffSend, takeover, releaseToAi } from "@/lib/services/conversations";
import { closeInquiry, createManualInquiry, staffUpdateQualification } from "@/lib/services/inquiries";
import { logMissedCall } from "@/lib/services/missedCalls";
import { bookAppointment, cancelAppointment, markAttendance, markDeposit, rescheduleAppointment } from "@/lib/services/appointments";
import { enqueueOutbound } from "@/lib/services/outbox";
import { prisma } from "@/lib/db";
import { DEFAULT_FOLLOW_UP_TEXT } from "@/lib/constants";

export async function sendMessageAction(formData: FormData) {
  const ctx = await requireClinic("send");
  const conversationId = String(formData.get("conversationId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  await staffSend({
    clinicId: ctx.clinicId,
    conversationId,
    userId: ctx.userId,
    body,
  });
  revalidatePath(`/inbox/${conversationId}`);
}

export async function takeoverAction(formData: FormData) {
  const ctx = await requireClinic("takeover");
  const conversationId = String(formData.get("conversationId") ?? "");
  await takeover({ clinicId: ctx.clinicId, conversationId, userId: ctx.userId });
  revalidatePath(`/inbox/${conversationId}`);
}

export async function releaseAiAction(formData: FormData) {
  const ctx = await requireClinic("takeover");
  const conversationId = String(formData.get("conversationId") ?? "");
  await releaseToAi({ clinicId: ctx.clinicId, conversationId, userId: ctx.userId });
  revalidatePath(`/inbox/${conversationId}`);
}

export async function qualificationAction(formData: FormData) {
  const ctx = await requireClinic("qualify");
  const inquiryId = String(formData.get("inquiryId") ?? "");
  await staffUpdateQualification({
    clinicId: ctx.clinicId,
    inquiryId,
    userId: ctx.userId,
    patch: {
      treatmentId: String(formData.get("treatmentId") || "") || null,
      treatmentLabel: String(formData.get("treatmentLabel") ?? "") || null,
      intent: String(formData.get("intent") ?? "unknown") as Intent,
      canAttendClinic: String(formData.get("canAttendClinic") ?? "unknown") as CanAttend,
      disqualifyReason: (String(formData.get("disqualifyReason") || "") || null) as DisqualifyReason | null,
      notes: String(formData.get("notes") ?? ""),
      lockedByStaff: true,
    },
  });
  revalidatePath("/inbox");
}

export async function closeInquiryAction(formData: FormData) {
  const ctx = await requireClinic("qualify");
  await closeInquiry({
    clinicId: ctx.clinicId,
    inquiryId: String(formData.get("inquiryId") ?? ""),
    userId: ctx.userId,
    reason: String(formData.get("reason")) as ClosedReason,
  });
  revalidatePath("/inbox");
}

export async function bookAction(formData: FormData) {
  const ctx = await requireClinic("book");
  const inquiryId = String(formData.get("inquiryId") ?? "");
  const startAt = new Date(String(formData.get("startAt")));
  const endAt = new Date(String(formData.get("endAt")));
  let error: "slot" | "book" | null = null;
  try {
    await bookAppointment({
      clinicId: ctx.clinicId,
      inquiryId,
      startAt,
      endAt,
      userId: ctx.userId,
    });
  } catch (e) {
    error =
      e instanceof Error && (e.message === "SLOT_TAKEN" || e.message === "ALREADY_SCHEDULED") ? "slot" : "book";
  }
  if (error) {
    const inq = await prisma.inquiry.findFirst({
      where: { id: inquiryId, clinicId: ctx.clinicId },
      select: { conversationId: true },
    });
    redirect(inq ? `/inbox/${inq.conversationId}?error=${error}` : `/inbox?error=${error}`);
  }
  revalidatePath("/inbox");
}

export async function rescheduleAction(formData: FormData) {
  const ctx = await requireClinic("book");
  let error: "slot" | "book" | null = null;
  try {
    await rescheduleAppointment({
      clinicId: ctx.clinicId,
      appointmentId: String(formData.get("appointmentId") ?? ""),
      startAt: new Date(String(formData.get("startAt"))),
      endAt: new Date(String(formData.get("endAt"))),
      userId: ctx.userId,
    });
  } catch (e) {
    error = e instanceof Error && (e.message === "SLOT_TAKEN" || e.message === "ALREADY_SCHEDULED") ? "slot" : "book";
  }
  if (error) redirect(`/calendar?error=${error}`);
  revalidatePath("/calendar");
  revalidatePath("/inbox");
}

export async function cancelApptAction(formData: FormData) {
  const ctx = await requireClinic("book");
  await cancelAppointment({
    clinicId: ctx.clinicId,
    appointmentId: String(formData.get("appointmentId") ?? ""),
    userId: ctx.userId,
    note: String(formData.get("note") ?? ""),
  });
  revalidatePath("/calendar");
  revalidatePath("/inbox");
}

export async function depositAction(formData: FormData) {
  const ctx = await requireClinic("deposit");
  await markDeposit({
    clinicId: ctx.clinicId,
    appointmentId: String(formData.get("appointmentId") ?? ""),
    userId: ctx.userId,
    deposited: formData.get("deposited") === "yes",
    amountMad: Number(formData.get("amountMad") || 0) || null,
  });
  revalidatePath("/calendar");
  revalidatePath("/inbox");
}

export async function attendanceAction(formData: FormData) {
  const ctx = await requireClinic("attendance");
  try {
    await markAttendance({
      clinicId: ctx.clinicId,
      appointmentId: String(formData.get("appointmentId") ?? ""),
      userId: ctx.userId,
      attendance: String(formData.get("attendance")) as "showed" | "no_show" | "pending",
    });
  } catch {
    return;
  }
  revalidatePath("/calendar");
}

export async function missedCallAction(formData: FormData) {
  const ctx = await requireClinic("missed_call");
  try {
    const result = await logMissedCall({
      clinicId: ctx.clinicId,
      userId: ctx.userId,
      phone: String(formData.get("phone") ?? ""),
      name: String(formData.get("name") ?? "") || undefined,
      notes: String(formData.get("notes") ?? "") || undefined,
      notifyPatient: formData.get("notifyPatient") !== "off",
    });
    revalidatePath("/inbox");
    return { booked: result.booked };
  } catch {
    throw new Error("Numéro invalide. Utilisez un numéro marocain, par exemple 06… ou +212…");
  }
}

export async function manualInquiryAction(formData: FormData) {
  const ctx = await requireClinic("send");
  try {
    await createManualInquiry({
      clinicId: ctx.clinicId,
      userId: ctx.userId,
      phone: String(formData.get("phone") ?? ""),
      name: String(formData.get("name") ?? "") || undefined,
      note: String(formData.get("note") ?? "") || undefined,
      sendWhatsApp: formData.get("sendWhatsApp") === "on",
      body: String(formData.get("body") ?? "") || undefined,
    });
  } catch {
    throw new Error("Numéro invalide. Utilisez un numéro marocain, par exemple 06… ou +212…");
  }
  revalidatePath("/inbox");
}

export async function manualFollowUpAction(formData: FormData) {
  const ctx = await requireClinic("follow_up");
  const inquiryId = String(formData.get("inquiryId") ?? "");
  const inquiry = await prisma.inquiry.findFirst({
    where: { id: inquiryId, clinicId: ctx.clinicId },
    include: { clinic: { include: { knowledge: true } }, conversation: true },
  });
  if (!inquiry) return;
  const body =
    String(formData.get("body") ?? "").trim() ||
    inquiry.clinic.knowledge?.followUpText ||
    DEFAULT_FOLLOW_UP_TEXT;
  const messageId = await enqueueOutbound({
    clinicId: ctx.clinicId,
    conversationId: inquiry.conversationId,
    inquiryId: inquiry.id,
    senderType: "staff",
    staffUserId: ctx.userId,
    body,
    templateName: "follow_up_nudge",
  });
  await prisma.followUp.create({
    data: {
      clinicId: ctx.clinicId,
      inquiryId: inquiry.id,
      step: 0,
      kind: "manual",
      scheduledAt: new Date(),
      sentAt: new Date(),
      messageId,
    },
  });
  revalidatePath("/inbox");
}
