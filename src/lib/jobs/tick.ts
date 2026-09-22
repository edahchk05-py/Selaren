import { prisma } from "../db";
import { DEFAULT_FOLLOW_UP_TEXT, SEND_OUTCOME_UNKNOWN } from "../constants";
import { firstNameFrom } from "../phone";
import { formatCasablanca, formatSlotLabel } from "../time";
import { linkAndFlushOutbound, flushQueuedMessage, messageSendSucceeded } from "../services/outbox";
import { processAiConversation } from "../services/ai";
import { markFollowUpExhausted, scheduleNextStallFollowUp } from "../services/followups";
import { claimFollowUp, claimReminder, releaseStaleClaims } from "./claim";

export async function runTick() {
  await releaseStaleClaims();
  await flushOutbox();
  await processAiQueue();
  await sendDueFollowUps();
  await sendDueReminders();
}

async function flushOutbox() {
  const queued = await prisma.message.findMany({
    where: { status: "queued", direction: "outbound", claimedAt: null },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  for (const m of queued) {
    await flushQueuedMessage(m.id);
  }
}

async function processAiQueue() {
  const pending = await prisma.conversation.findMany({
    where: { needsAiReply: true, mode: "ai", aiClaimedAt: null },
    orderBy: { updatedAt: "asc" },
    select: { id: true },
    take: 5,
  });
  for (const conv of pending) {
    await processAiConversation(conv.id);
  }
}

async function sendDueFollowUps() {
  const due = await prisma.followUp.findMany({
    where: {
      sentAt: null,
      canceledAt: null,
      claimedAt: null,
      scheduledAt: { lte: new Date() },
      kind: "stall",
    },
    include: {
      inquiry: {
        include: {
          clinic: { include: { knowledge: true } },
          conversation: { include: { contact: true } },
          qualification: true,
        },
      },
    },
    take: 20,
  });

  for (const fu of due) {
    if (!(await claimFollowUp(fu.id))) continue;

    const inq = fu.inquiry;
    if (
      inq.status !== "open" ||
      inq.qualification?.status === "disqualified" ||
      inq.conversation.mode !== "ai" ||
      inq.clinic.status !== "active" ||
      inq.conversation.contact.waOptOut
    ) {
      await prisma.followUp.update({
        where: { id: fu.id },
        data: { canceledAt: new Date(), skipReason: skipForFollowUp(inq) },
      });
      continue;
    }
    const booked = await prisma.appointment.findFirst({
      where: { contactId: inq.contactId, status: "scheduled" },
    });
    if (booked) {
      await prisma.followUp.update({
        where: { id: fu.id },
        data: { canceledAt: new Date(), skipReason: "booked" },
      });
      continue;
    }

    const tpl = inq.clinic.knowledge?.followUpText?.trim() || DEFAULT_FOLLOW_UP_TEXT;
    const first = firstNameFrom(inq.conversation.contact.name);
    const body = first ? tpl.replace("Bonjour", `Bonjour ${first}`) : tpl;

    const messageId = await linkAndFlushOutbound({
      existingMessageId: fu.messageId,
      persistMessageId: async (id) => {
        await prisma.followUp.update({ where: { id: fu.id }, data: { messageId: id } });
      },
      create: {
        clinicId: inq.clinicId,
        conversationId: inq.conversationId,
        inquiryId: inq.id,
        senderType: "system",
        body,
        templateName: "follow_up_nudge",
        rescheduleStall: false,
      },
    });

    await settleLinkedJob("followUp", fu.id, messageId, async () => {
      if (fu.step >= 4) {
        await markFollowUpExhausted(inq.id);
      } else {
        await scheduleNextStallFollowUp(inq.id);
      }
    });
  }
}

function skipForFollowUp(inq: {
  status: string;
  qualification?: { status: string } | null;
  conversation: { mode: string; contact: { waOptOut: boolean } };
  clinic: { status: string };
}): string {
  if (inq.conversation.contact.waOptOut) return "opt_out";
  if (inq.clinic.status !== "active") return "clinic_not_active";
  if (inq.status !== "open") return "inquiry_not_open";
  if (inq.qualification?.status === "disqualified") return "disqualified";
  if (inq.conversation.mode !== "ai") return "human_mode";
  return "skipped";
}

async function sendDueReminders() {
  const due = await prisma.reminder.findMany({
    where: { sentAt: null, canceledAt: null, skipReason: null, claimedAt: null, scheduledAt: { lte: new Date() } },
    include: {
      appointment: {
        include: {
          clinic: true,
          contact: true,
          inquiry: { include: { conversation: true } },
        },
      },
    },
    take: 20,
  });

  for (const rem of due) {
    if (!(await claimReminder(rem.id))) continue;

    const appt = rem.appointment;
    if (appt.status !== "scheduled") {
      await prisma.reminder.update({
        where: { id: rem.id },
        data: { canceledAt: new Date(), skipReason: "not_scheduled" },
      });
      continue;
    }
    if (appt.clinic.status !== "active") {
      await prisma.reminder.update({
        where: { id: rem.id },
        data: { claimedAt: null },
      });
      continue;
    }
    if (appt.contact.waOptOut) {
      await prisma.reminder.update({
        where: { id: rem.id },
        data: { canceledAt: new Date(), skipReason: "opt_out" },
      });
      continue;
    }

    const when = formatSlotLabel(appt.startAt, appt.endAt);
    const date = formatCasablanca(appt.startAt, { day: "numeric", month: "long", year: "numeric" });
    const time = formatCasablanca(appt.startAt, { hour: "2-digit", minute: "2-digit" });
    const body = `Rappel : consultation à ${appt.clinic.name} le ${date} à ${time} (${when.split(" ").slice(0, 1).join(" ")}). Répondez si vous devez modifier.`;

    const messageId = await linkAndFlushOutbound({
      existingMessageId: rem.messageId,
      persistMessageId: async (id) => {
        await prisma.reminder.update({ where: { id: rem.id }, data: { messageId: id } });
      },
      create: {
        clinicId: appt.clinicId,
        conversationId: appt.inquiry.conversationId,
        inquiryId: appt.inquiryId,
        senderType: "system",
        body,
        templateName: "appointment_reminder",
        rescheduleStall: false,
      },
    });

    await settleLinkedJob("reminder", rem.id, messageId);
  }
}

async function settleLinkedJob(
  kind: "followUp" | "reminder",
  jobId: string,
  messageId: string,
  onSent?: () => Promise<void>,
) {
  if (await messageSendSucceeded(messageId)) {
    if (kind === "followUp") {
      await prisma.followUp.update({
        where: { id: jobId },
        data: { sentAt: new Date(), messageId },
      });
    } else {
      await prisma.reminder.update({
        where: { id: jobId },
        data: { sentAt: new Date(), messageId },
      });
    }
    if (onSent) await onSent();
    return;
  }

  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  const skip = msg?.errorDetail?.slice(0, 120) ?? "send_failed";

  if (msg?.status === "queued" && !msg.sendStartedAt) {
    if (kind === "followUp") {
      await prisma.followUp.update({
        where: { id: jobId },
        data: { messageId, claimedAt: null },
      });
    } else {
      await prisma.reminder.update({
        where: { id: jobId },
        data: { messageId, claimedAt: null },
      });
    }
    return;
  }

  if (kind === "followUp") {
    await prisma.followUp.update({
      where: { id: jobId },
      data: {
        messageId,
        canceledAt: new Date(),
        skipReason: msg?.errorDetail === SEND_OUTCOME_UNKNOWN ? SEND_OUTCOME_UNKNOWN : skip,
      },
    });
  } else {
    await prisma.reminder.update({
      where: { id: jobId },
      data: {
        messageId,
        canceledAt: new Date(),
        skipReason: msg?.errorDetail === SEND_OUTCOME_UNKNOWN ? SEND_OUTCOME_UNKNOWN : skip,
      },
    });
  }
}
