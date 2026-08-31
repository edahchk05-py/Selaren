import { CLAIM_STALE_MS, SEND_OUTCOME_UNKNOWN } from "../constants";
import { prisma } from "../db";

export function claimStaleBefore(): Date {
  return new Date(Date.now() - CLAIM_STALE_MS);
}

/**
 * Stale claims:
 * - Graph never started → release so the same message row can be sent.
 * - Graph may have been invoked (`send_started_at`) → mark unknown, never send again.
 */
export async function releaseStaleClaims() {
  const stale = claimStaleBefore();
  await prisma.message.updateMany({
    where: {
      status: "queued",
      direction: "outbound",
      sendStartedAt: { not: null },
      claimedAt: { lte: stale },
    },
    data: { status: "failed", errorDetail: SEND_OUTCOME_UNKNOWN },
  });
  await prisma.message.updateMany({
    where: {
      status: "queued",
      direction: "outbound",
      sendStartedAt: null,
      claimedAt: { lte: stale },
    },
    data: { claimedAt: null },
  });
  await prisma.followUp.updateMany({
    where: { sentAt: null, canceledAt: null, claimedAt: { lte: stale } },
    data: { claimedAt: null },
  });
  await prisma.reminder.updateMany({
    where: { sentAt: null, canceledAt: null, claimedAt: { lte: stale } },
    data: { claimedAt: null },
  });
}

export async function claimQueuedMessage(messageId: string): Promise<boolean> {
  const claimed = await prisma.message.updateMany({
    where: { id: messageId, status: "queued", direction: "outbound", claimedAt: null },
    data: { claimedAt: new Date() },
  });
  return claimed.count === 1;
}

export async function claimFollowUp(id: string): Promise<boolean> {
  const claimed = await prisma.followUp.updateMany({
    where: { id, sentAt: null, canceledAt: null, claimedAt: null },
    data: { claimedAt: new Date() },
  });
  return claimed.count === 1;
}

export async function claimReminder(id: string): Promise<boolean> {
  const claimed = await prisma.reminder.updateMany({
    where: { id, sentAt: null, canceledAt: null, skipReason: null, claimedAt: null },
    data: { claimedAt: new Date() },
  });
  return claimed.count === 1;
}
