import { InquirySource, InquiryStatus } from "@prisma/client";
import { prisma } from "../db";
import { normalizePhoneE164 } from "../phone";
import { DEFAULT_MISSED_CALL_TEXT } from "../constants";
import { audit } from "../audit";
import { enqueueOutbound } from "./outbox";

export async function logMissedCall(args: {
  clinicId: string;
  userId: string;
  phone: string;
  name?: string;
  calledAt?: Date;
  notes?: string;
  notifyPatient?: boolean;
}) {
  const phone = normalizePhoneE164(args.phone);
  if (!phone) throw new Error("INVALID_PHONE");

  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: args.clinicId },
    include: { knowledge: true },
  });

  const existing = await prisma.contact.findUnique({
    where: { clinicId_phoneE164: { clinicId: args.clinicId, phoneE164: phone } },
  });
  const contact = existing
    ? await prisma.contact.update({
        where: { id: existing.id },
        data: !existing.name && args.name?.trim() ? { name: args.name.trim() } : {},
      })
    : await prisma.contact.create({
        data: {
          clinicId: args.clinicId,
          phoneE164: phone,
          name: args.name?.trim() || null,
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
    where: { contactId: contact.id, status: { in: [InquiryStatus.open, InquiryStatus.booked] } },
  });
  let createdNew = false;
  if (!inquiry) {
    inquiry = await prisma.inquiry.create({
      data: {
        clinicId: args.clinicId,
        contactId: contact.id,
        conversationId: conversation.id,
        source: InquirySource.missed_call,
        status: InquiryStatus.open,
        qualification: { create: { clinicId: args.clinicId } },
      },
    });
    createdNew = true;
  }

  const notify = args.notifyPatient ?? true;
  const booked = inquiry.status === InquiryStatus.booked;

  const missed = await prisma.missedCall.create({
    data: {
      clinicId: args.clinicId,
      contactId: contact.id,
      inquiryId: inquiry.id,
      calledAt: args.calledAt ?? new Date(),
      loggedByUserId: args.userId,
      notes: args.notes ?? "",
      notifyPatient: booked ? false : notify,
    },
  });

  if (!booked && notify) {
    const body =
      clinic.knowledge?.missedCallText?.trim() || DEFAULT_MISSED_CALL_TEXT;
    await enqueueOutbound({
      clinicId: args.clinicId,
      conversationId: conversation.id,
      inquiryId: inquiry.id,
      senderType: "system",
      body,
      templateName: "missed_call_recovery",
    });
  } else if (booked) {
    await prisma.message.create({
      data: {
        clinicId: args.clinicId,
        conversationId: conversation.id,
        direction: "outbound",
        senderType: "system",
        body: "Note interne : appel manqué sur un patient déjà réservé. Pas de message commercial envoyé.",
        status: "sent",
      },
    });
  }

  await audit({
    clinicId: args.clinicId,
    userId: args.userId,
    action: "missed_call_log",
    entityType: "missed_call",
    entityId: missed.id,
    metadata: { createdNew, booked },
  });

  return { booked };
}
