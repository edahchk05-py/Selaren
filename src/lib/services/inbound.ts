import { ConversationMode, InquirySource, InquiryStatus } from "@prisma/client";
import { prisma } from "../db";
import { normalizePhoneE164 } from "../phone";
import { decryptSecret } from "../crypto";
import { downloadWhatsAppMedia } from "../whatsapp/client";
import { saveClinicMedia } from "../media";
import { isInsideCustomerCareWindow } from "../window";
import { cancelPendingStallFollowUps, scheduleNextStallFollowUp } from "./followups";
import { applyWhatsAppStatus } from "./outbox";
import type { InboundExtract } from "../whatsapp/webhook";

function e164FromWa(from: string): string | null {
  return normalizePhoneE164(from.startsWith("+") ? from : `+${from}`);
}

export async function ingestInbound(item: InboundExtract) {
  const existing = await prisma.message.findUnique({
    where: { waMessageId: item.waMessageId },
  });
  if (existing) return { duplicate: true as const, conversationId: existing.conversationId, queuedAi: false as const };

  const conn = await prisma.whatsAppConnection.findUnique({
    where: { phoneNumberId: item.phoneNumberId },
    include: { clinic: true },
  });
  if (!conn) {
    console.warn("unknown_phone_number_id", item.phoneNumberId);
    return { unknownClinic: true as const };
  }

  const phone = e164FromWa(item.from);
  if (!phone) return { invalidPhone: true as const };

  const clinic = conn.clinic;
  const contact = await prisma.contact.upsert({
    where: { clinicId_phoneE164: { clinicId: clinic.id, phoneE164: phone } },
    create: { clinicId: clinic.id, phoneE164: phone },
    update: {},
  });

  const aiAllowed = clinic.status === "active";
  let conversation = await prisma.conversation.findUnique({
    where: { contactId: contact.id },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        clinicId: clinic.id,
        contactId: contact.id,
        mode: aiAllowed ? ConversationMode.ai : ConversationMode.human,
        status: "open",
      },
    });
  } else if (conversation.status === "closed") {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: "open" },
    });
  }

  let mediaUrl: string | null = null;
  let mediaType: string | null = item.mediaType ?? null;
  if (item.mediaId && conn.accessTokenEncrypted) {
    try {
      const token = decryptSecret(conn.accessTokenEncrypted);
      const file = await downloadWhatsAppMedia({ mediaId: item.mediaId, token });
      mediaUrl = await saveClinicMedia(clinic.id, file.buffer, file.mimeType);
    } catch (err) {
      console.error("media_download_failed", err);
    }
  }

  const mediaOnly = Boolean(item.mediaType) && !item.text.trim();

  await prisma.message.create({
    data: {
      clinicId: clinic.id,
      conversationId: conversation.id,
      direction: "inbound",
      senderType: "patient",
      body: item.text,
      mediaUrl,
      mediaType,
      waMessageId: item.waMessageId,
      status: "delivered",
    },
  });

  const now = new Date();
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastPatientMessageAt: now,
      unreadCount: { increment: 1 },
      status: "open",
    },
  });

  let inquiry = await prisma.inquiry.findFirst({
    where: {
      contactId: contact.id,
      status: { in: [InquiryStatus.open, InquiryStatus.booked] },
    },
  });

  if (!inquiry) {
    inquiry = await prisma.inquiry.create({
      data: {
        clinicId: clinic.id,
        contactId: contact.id,
        conversationId: conversation.id,
        source: InquirySource.whatsapp,
        status: InquiryStatus.open,
        qualification: {
          create: { clinicId: clinic.id, status: "unevaluated" },
        },
      },
    });
  }

  await scheduleNextStallFollowUp(inquiry.id);

  const fresh = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversation.id },
  });

  if (mediaOnly) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { aiHaltReason: "media_only", needsAiReply: false },
    });
    return { inquiryId: inquiry.id, conversationId: conversation.id, queuedAi: false as const };
  }

  const mayAi =
    clinic.status === "active" &&
    fresh.mode === "ai" &&
    !fresh.aiHaltReason &&
    !contact.waOptOut &&
    isInsideCustomerCareWindow(now);

  if (mayAi) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { needsAiReply: true },
    });
  }

  return { inquiryId: inquiry.id, conversationId: conversation.id, queuedAi: mayAi };
}

export async function applyOptOut(clinicPhoneNumberId: string, phoneE164: string) {
  const conn = await prisma.whatsAppConnection.findUnique({
    where: { phoneNumberId: clinicPhoneNumberId },
  });
  if (!conn) return;
  const phone = e164FromWa(phoneE164) ?? phoneE164;
  const contact = await prisma.contact.findUnique({
    where: { clinicId_phoneE164: { clinicId: conn.clinicId, phoneE164: phone } },
  });
  if (!contact) return;
  await prisma.contact.update({
    where: { id: contact.id },
    data: { waOptOut: true },
  });
  const open = await prisma.inquiry.findMany({
    where: { contactId: contact.id, status: { in: ["open", "booked"] } },
  });
  for (const inq of open) {
    await cancelPendingStallFollowUps(inq.id);
  }
  await prisma.reminder.updateMany({
    where: {
      appointment: { contactId: contact.id, status: "scheduled" },
      sentAt: null,
      canceledAt: null,
    },
    data: { canceledAt: new Date(), skipReason: "opt_out" },
  });
}

export async function ingestStatus(waMessageId: string, status: string) {
  await applyWhatsAppStatus(waMessageId, status);
}
