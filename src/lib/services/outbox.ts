import { MessageSenderType, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { SEND_OUTCOME_UNKNOWN } from "../constants";
import { requiredSendChannel } from "../window";
import { decryptSecret } from "../crypto";
import { sendSessionText, sendTemplate, WhatsAppSendError } from "../whatsapp/client";
import { scheduleNextStallFollowUp } from "./followups";
import { firstNameFrom } from "../phone";
import { claimQueuedMessage } from "../jobs/claim";

export type EnqueueOutboundArgs = {
  clinicId: string;
  conversationId: string;
  inquiryId: string | null;
  senderType: MessageSenderType;
  staffUserId?: string | null;
  body: string;
  templateName?: string | null;
  templateParams?: string[];
  /** Default true. Follow-up/reminder ticks pass false so they are not canceled mid-send. */
  rescheduleStall?: boolean;
};

export async function markFirstResponse(inquiryId: string, at = new Date()) {
  await prisma.inquiry.updateMany({
    where: { id: inquiryId, firstResponseAt: null },
    data: { firstResponseAt: at },
  });
}

export async function messageSendSucceeded(messageId: string): Promise<boolean> {
  const m = await prisma.message.findUnique({ where: { id: messageId } });
  return m?.status === "sent" || m?.status === "delivered" || m?.status === "read";
}

/** Persist one logical outbound row. Does not call Meta. */
export async function createQueuedOutbound(args: EnqueueOutboundArgs): Promise<string> {
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: args.conversationId },
    include: { contact: true },
  });
  if (conversation.contact.waOptOut && args.senderType !== "staff") {
    const msg = await prisma.message.create({
      data: {
        clinicId: args.clinicId,
        conversationId: args.conversationId,
        direction: "outbound",
        senderType: args.senderType,
        staffUserId: args.staffUserId ?? null,
        body: args.body,
        templateName: args.templateName ?? null,
        status: "failed",
        errorDetail: "opt_out",
      },
    });
    return msg.id;
  }

  const channel = requiredSendChannel(conversation.lastPatientMessageAt);
  const templateName = args.templateName ?? null;
  if (channel === "template" && !templateName) {
    const msg = await prisma.message.create({
      data: {
        clinicId: args.clinicId,
        conversationId: args.conversationId,
        direction: "outbound",
        senderType: args.senderType,
        staffUserId: args.staffUserId ?? null,
        body: args.body,
        status: "failed",
        errorDetail: "outside_window_template_required",
      },
    });
    await prisma.conversation.update({
      where: { id: args.conversationId },
      data: { aiHaltReason: "outside_window" },
    });
    return msg.id;
  }

  const msg = await prisma.message.create({
    data: {
      clinicId: args.clinicId,
      conversationId: args.conversationId,
      direction: "outbound",
      senderType: args.senderType,
      staffUserId: args.staffUserId ?? null,
      body: args.body,
      templateName: templateName,
      status: "queued",
    },
  });

  if (args.inquiryId && args.rescheduleStall !== false) {
    await scheduleNextStallFollowUp(args.inquiryId);
  }

  return msg.id;
}

export async function enqueueOutbound(args: EnqueueOutboundArgs): Promise<string> {
  const id = await createQueuedOutbound(args);
  await flushQueuedMessage(id);
  return id;
}

/**
 * Reuse one message row for a follow-up/reminder. Never creates a second
 * logical outbound for the same job. Persists the link before calling Meta.
 */
export async function linkAndFlushOutbound(args: {
  existingMessageId: string | null;
  create: EnqueueOutboundArgs;
  persistMessageId: (messageId: string) => Promise<void>;
}): Promise<string> {
  let id = args.existingMessageId;
  if (!id) {
    id = await createQueuedOutbound(args.create);
    await args.persistMessageId(id);
  }
  await flushQueuedMessage(id);
  return id;
}

export async function flushQueuedMessage(messageId: string) {
  const claimed = await claimQueuedMessage(messageId);
  if (!claimed) return;

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      conversation: { include: { contact: true } },
      clinic: { include: { whatsappConnection: true } },
    },
  });
  if (!message || message.status !== "queued") return;
  if (message.direction !== "outbound") return;

  if (message.sendStartedAt) {
    await prisma.message.update({
      where: { id: message.id },
      data: { status: "failed", errorDetail: SEND_OUTCOME_UNKNOWN },
    });
    return;
  }

  const conn = message.clinic.whatsappConnection;
  if (!conn || conn.status !== "active") {
    await prisma.message.update({
      where: { id: message.id },
      data: { status: "failed", errorDetail: "whatsapp_disconnected", sendAttempts: { increment: 1 } },
    });
    await prisma.conversation.update({
      where: { id: message.conversationId },
      data: { aiHaltReason: "ai_provider_error" },
    });
    return;
  }

  if (message.conversation.contact.waOptOut) {
    await prisma.message.update({
      where: { id: message.id },
      data: { status: "failed", errorDetail: "opt_out" },
    });
    return;
  }

  const token = decryptSecret(conn.accessTokenEncrypted);
  const to = message.conversation.contact.phoneE164.replace("+", "");
  const channel = requiredSendChannel(message.conversation.lastPatientMessageAt);
  const templateName = message.templateName;

  const insideWindow = channel === "session";
  if (!insideWindow && !templateName) {
    await prisma.message.update({
      where: { id: message.id },
      data: { status: "failed", errorDetail: "outside_window_template_required" },
    });
    await prisma.conversation.update({
      where: { id: message.conversationId },
      data: { aiHaltReason: "outside_window" },
    });
    return;
  }

  await prisma.message.update({
    where: { id: message.id },
    data: { sendStartedAt: new Date() },
  });

  try {
    let waId: string | undefined;
    if (insideWindow) {
      const res = await sendSessionText({
        phoneNumberId: conn.phoneNumberId,
        token,
        to,
        body: message.body,
      });
      waId = res.messageId;
    } else {
      const res = await sendTemplate({
        phoneNumberId: conn.phoneNumberId,
        token,
        to,
        template: templateName!,
        language: "fr",
        bodyParams: templateParamsFromBody(
          message.body,
          templateName!,
          message.clinic.name,
          message.conversation.contact.name,
        ),
      });
      waId = res.messageId;
    }

    try {
      await prisma.message.update({
        where: { id: message.id },
        data: {
          status: "sent",
          waMessageId: waId ?? undefined,
          sendAttempts: { increment: 1 },
        },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;
      await prisma.message.update({
        where: { id: message.id },
        data: { status: "sent", sendAttempts: { increment: 1 } },
      });
    }
    await prisma.conversation.update({
      where: { id: message.conversationId },
      data: { lastOutboundAt: new Date() },
    });
    const inquiry = await prisma.inquiry.findFirst({
      where: { conversationId: message.conversationId, status: { in: ["open", "booked"] } },
    });
    if (inquiry) await markFirstResponse(inquiry.id);
    if (message.templateName === "appointment_confirmation") {
      await prisma.appointment.updateMany({
        where: {
          inquiry: { conversationId: message.conversationId },
          status: "scheduled",
          confirmationSentAt: null,
        },
        data: { confirmationSentAt: new Date() },
      });
    }
  } catch (err) {
    const definiteHttp =
      err instanceof WhatsAppSendError && typeof err.statusCode === "number" && err.statusCode > 0;
    const detail = definiteHttp
      ? err instanceof Error
        ? err.message.slice(0, 500)
        : "send_failed"
      : SEND_OUTCOME_UNKNOWN;
    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: "failed",
        errorDetail: detail,
        sendAttempts: { increment: 1 },
      },
    });
    await prisma.conversation.update({
      where: { id: message.conversationId },
      data: { aiHaltReason: message.senderType === "ai" ? "ai_provider_error" : message.conversation.aiHaltReason },
    });
  }
}

function templateParamsFromBody(
  body: string,
  template: string,
  clinicName: string,
  contactName: string | null,
): string[] {
  const first = firstNameFrom(contactName) || "Bonjour";
  const dateMatch = body.match(/(\d{1,2}\s+\S+(?:\s+\d{4})?|\d{4}-\d{2}-\d{2})/);
  const timeMatch = body.match(/(\d{2}:\d{2})/);
  const date = dateMatch?.[0] ?? "prochainement";
  const time = timeMatch?.[0] ?? "—";
  if (template === "appointment_reminder" || template === "appointment_confirmation") {
    return [clinicName, first, date, time];
  }
  if (template === "appointment_cancelled") return [clinicName, first];
  return [clinicName, first];
}

export async function applyWhatsAppStatus(waMessageId: string, status: string) {
  const mapped =
    status === "delivered" ? "delivered" : status === "read" ? "read" : status === "failed" ? "failed" : null;
  if (!mapped) return;
  await prisma.message.updateMany({
    where: { waMessageId },
    data: { status: mapped },
  });
}

void Prisma;
