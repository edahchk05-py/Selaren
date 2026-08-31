import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { timeFromDb } from "../time";
import { generateFreeSlots, type FreeSlot } from "../slots";

type Db = PrismaClient | Prisma.TransactionClient;

export async function listFreeSlots(clinicId: string, now = new Date(), staffOverrideLead = false): Promise<FreeSlot[]> {
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: clinicId },
    include: {
      workingHours: true,
      availabilityExceptions: true,
    },
  });

  const occupied = await prisma.appointment.findMany({
    where: { clinicId, status: "scheduled" },
    select: { startAt: true, endAt: true },
  });

  return generateFreeSlots({
    now,
    slotMinutes: clinic.defaultSlotMinutes,
    hours: clinic.workingHours.map((h) => ({
      weekday: h.weekday,
      enabled: h.enabled,
      startTime: timeFromDb(h.startTime),
      endTime: timeFromDb(h.endTime),
    })),
    blocked: clinic.availabilityExceptions.map((e) => ({
      startAt: e.startAt,
      endAt: e.endAt,
    })),
    occupied,
    staffOverrideLead,
  });
}

export async function assertSlotFree(
  clinicId: string,
  startAt: Date,
  endAt: Date,
  ignoreAppointmentId?: string,
  db: Db = prisma,
) {
  const overlap = await db.appointment.findFirst({
    where: {
      clinicId,
      status: "scheduled",
      id: ignoreAppointmentId ? { not: ignoreAppointmentId } : undefined,
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
  });
  if (overlap) {
    throw new Error("SLOT_TAKEN");
  }
}

export function mapBookingConflict(err: unknown): Error {
  if (err instanceof Error && (err.message === "SLOT_TAKEN" || err.message === "ALREADY_SCHEDULED")) {
    return err;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = JSON.stringify(err.meta?.target ?? "");
    if (/contact/i.test(target)) return new Error("ALREADY_SCHEDULED");
    return new Error("SLOT_TAKEN");
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/appointments_one_scheduled_per_contact/i.test(msg)) return new Error("ALREADY_SCHEDULED");
  if (/appointments_no_overlap|23P01|exclusion/i.test(msg)) return new Error("SLOT_TAKEN");
  return err instanceof Error ? err : new Error(String(err));
}
