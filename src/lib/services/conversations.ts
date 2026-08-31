import { prisma } from "../db";
import { audit } from "../audit";
import { cancelPendingStallFollowUps, scheduleNextStallFollowUp } from "./followups";
import { enqueueOutbound } from "./outbox";
import { isInsideCustomerCareWindow } from "../window";

export async function takeover(args: {
  clinicId: string;
  conversationId: string;
  userId: string;
}) {
  const conv = await prisma.conversation.findUniqueOrThrow({
    where: { id: args.conversationId },
  });
  if (conv.clinicId !== args.clinicId) throw new Error("TENANT");

  await prisma.conversation.update({
    where: { id: conv.id },
    data: {
      mode: "human",
      needsAiReply: false,
      aiHaltReason: conv.aiHaltReason,
    },
  });

  const inquiry = await prisma.inquiry.findFirst({
    where: { conversationId: conv.id, status: { in: ["open", "booked"] } },
  });
  if (inquiry) await cancelPendingStallFollowUps(inquiry.id);

  await audit({
    clinicId: args.clinicId,
    userId: args.userId,
    action: "takeover",
    entityType: "conversation",
    entityId: conv.id,
  });
}

export async function releaseToAi(args: {
  clinicId: string;
  conversationId: string;
  userId: string;
}) {
  const conv = await prisma.conversation.findUniqueOrThrow({
    where: { id: args.conversationId },
    include: { clinic: true },
  });
  if (conv.clinicId !== args.clinicId) throw new Error("TENANT");
  if (conv.clinic.status !== "active") throw new Error("CLINIC_NOT_ACTIVE");

  const last = await prisma.message.findFirst({
    where: { conversationId: conv.id },
    orderBy: { createdAt: "desc" },
  });

  const needs =
    last?.direction === "inbound" &&
    isInsideCustomerCareWindow(conv.lastPatientMessageAt);

  await prisma.conversation.update({
    where: { id: conv.id },
    data: {
      mode: "ai",
      aiHaltReason: null,
      needsAiReply: needs,
    },
  });

  const inquiry = await prisma.inquiry.findFirst({
    where: { conversationId: conv.id, status: "open" },
  });
  if (inquiry) await scheduleNextStallFollowUp(inquiry.id);

  await audit({
    clinicId: args.clinicId,
    userId: args.userId,
    action: "release_ai",
    entityType: "conversation",
    entityId: conv.id,
  });
}

export async function staffSend(args: {
  clinicId: string;
  conversationId: string;
  userId: string;
  body: string;
}) {
  await takeover({
    clinicId: args.clinicId,
    conversationId: args.conversationId,
    userId: args.userId,
  });
  const inquiry = await prisma.inquiry.findFirst({
    where: { conversationId: args.conversationId, status: { in: ["open", "booked"] } },
  });
  await enqueueOutbound({
    clinicId: args.clinicId,
    conversationId: args.conversationId,
    inquiryId: inquiry?.id ?? null,
    senderType: "staff",
    staffUserId: args.userId,
    body: args.body,
  });
}

export async function markConversationRead(conversationId: string) {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { unreadCount: 0, lastStaffViewedAt: new Date() },
  });
}
