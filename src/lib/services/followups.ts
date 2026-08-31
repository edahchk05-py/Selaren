import { FollowUpKind, InquiryStatus, QualificationStatus } from "@prisma/client";
import { prisma } from "../db";
import { nextStallScheduledAt } from "../quietHours";

export async function lastActivityAt(inquiryId: string): Promise<Date> {
  const inquiry = await prisma.inquiry.findUniqueOrThrow({
    where: { id: inquiryId },
    include: {
      conversation: {
        include: {
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });
  const lastMsg = inquiry.conversation.messages[0]?.createdAt;
  const times = [inquiry.createdAt, lastMsg].filter(Boolean) as Date[];
  return new Date(Math.max(...times.map((d) => d.getTime())));
}

export async function cancelPendingStallFollowUps(inquiryId: string) {
  await prisma.followUp.updateMany({
    where: {
      inquiryId,
      kind: FollowUpKind.stall,
      sentAt: null,
      canceledAt: null,
    },
    data: { canceledAt: new Date() },
  });
}

export async function pauseStallFollowUps(inquiryId: string) {
  await cancelPendingStallFollowUps(inquiryId);
}

export async function scheduleNextStallFollowUp(inquiryId: string) {
  const inquiry = await prisma.inquiry.findUniqueOrThrow({
    where: { id: inquiryId },
    include: {
      qualification: true,
      conversation: true,
      clinic: true,
      contact: true,
      followUps: true,
    },
  });

  await cancelPendingStallFollowUps(inquiryId);

  if (inquiry.status !== InquiryStatus.open) return;
  if (inquiry.qualification?.status === QualificationStatus.disqualified) return;
  if (inquiry.conversation.mode !== "ai") return;
  if (inquiry.clinic.status !== "active") return;
  if (inquiry.contact.waOptOut) return;

  const scheduledAppt = await prisma.appointment.findFirst({
    where: { contactId: inquiry.contactId, status: "scheduled" },
  });
  if (scheduledAppt) return;

  const sentSteps = inquiry.followUps
    .filter((f) => f.kind === "stall" && f.sentAt)
    .map((f) => f.step);
  const maxSent = sentSteps.length ? Math.max(...sentSteps) : 0;
  if (maxSent >= 4) return;

  const nextStep = (maxSent + 1) as 1 | 2 | 3 | 4;
  const activity = await lastActivityAt(inquiryId);
  const scheduledAt = nextStallScheduledAt(activity, nextStep);

  await prisma.followUp.create({
    data: {
      clinicId: inquiry.clinicId,
      inquiryId,
      step: nextStep,
      kind: FollowUpKind.stall,
      scheduledAt,
    },
  });
}

export async function markFollowUpExhausted(inquiryId: string) {
  await prisma.conversation.updateMany({
    where: { inquiries: { some: { id: inquiryId } } },
    data: { aiHaltReason: "follow_up_exhausted" },
  });
}
