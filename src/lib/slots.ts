import {
  SLOT_LEAD_MINUTES,
  SLOT_OFFER_LIMIT,
  SLOT_WINDOW_DAYS,
} from "./constants";
import { addDaysYmd, casablancaDateTime, isoWeekdayMon0, ymdInCasablanca } from "./time";

export type WorkingHourRow = {
  weekday: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

export type BusyRange = { startAt: Date; endAt: Date };

export type FreeSlot = { startAt: Date; endAt: Date };

function overlaps(a: BusyRange, b: BusyRange): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

function parseMinutes(hms: string): number {
  const [h, m] = hms.split(":").map(Number);
  return h! * 60 + m!;
}

export function generateFreeSlots(args: {
  now: Date;
  slotMinutes: number;
  hours: WorkingHourRow[];
  blocked: BusyRange[];
  occupied: BusyRange[];
  leadMinutes?: number;
  windowDays?: number;
  limit?: number;
  staffOverrideLead?: boolean;
}): FreeSlot[] {
  const lead = args.staffOverrideLead ? 0 : (args.leadMinutes ?? SLOT_LEAD_MINUTES);
  const windowDays = args.windowDays ?? SLOT_WINDOW_DAYS;
  const limit = args.limit ?? SLOT_OFFER_LIMIT;
  const earliest = new Date(args.now.getTime() + lead * 60 * 1000);
  const byWeekday = new Map(args.hours.map((h) => [h.weekday, h]));
  const slots: FreeSlot[] = [];
  const startYmd = ymdInCasablanca(args.now);

  for (let day = 0; day < windowDays; day++) {
    const ymd = addDaysYmd(startYmd, day);
    const noon = casablancaDateTime(ymd, "12:00:00");
    const weekday = isoWeekdayMon0(noon);
    const hours = byWeekday.get(weekday);
    if (!hours?.enabled) continue;

    const dayStartMin = parseMinutes(hours.startTime);
    const dayEndMin = parseMinutes(hours.endTime);
    for (let t = dayStartMin; t + args.slotMinutes <= dayEndMin; t += args.slotMinutes) {
      const sh = String(Math.floor(t / 60)).padStart(2, "0");
      const sm = String(t % 60).padStart(2, "0");
      const eh = String(Math.floor((t + args.slotMinutes) / 60)).padStart(2, "0");
      const em = String((t + args.slotMinutes) % 60).padStart(2, "0");
      const startAt = casablancaDateTime(ymd, `${sh}:${sm}:00`);
      const endAt = casablancaDateTime(ymd, `${eh}:${em}:00`);
      if (startAt < earliest) continue;
      const range = { startAt, endAt };
      if (args.blocked.some((b) => overlaps(range, b))) continue;
      if (args.occupied.some((o) => overlaps(range, o))) continue;
      slots.push(range);
      if (slots.length >= limit) return slots;
    }
  }
  return slots;
}

export function slotStillFree(
  slot: FreeSlot,
  occupied: BusyRange[],
  blocked: BusyRange[],
): boolean {
  if (occupied.some((o) => overlaps(slot, o))) return false;
  if (blocked.some((b) => overlaps(slot, b))) return false;
  return true;
}
