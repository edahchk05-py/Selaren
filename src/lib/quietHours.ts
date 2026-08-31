import { QUIET_HOUR_END, QUIET_HOUR_START } from "./constants";
import { toCasablanca } from "./time";
import { fromZonedTime } from "date-fns-tz";
import { TIMEZONE } from "./constants";

/**
 * Automatic stall follow-ups must not fire between 21:00 and 09:00 Casablanca.
 * If they would, delay to the next 09:00.
 */
export function delayForQuietHours(scheduledAt: Date): Date {
  const local = toCasablanca(scheduledAt);
  const hour = local.getHours();
  const inQuiet = hour >= QUIET_HOUR_START || hour < QUIET_HOUR_END;
  if (!inQuiet) return scheduledAt;

  const y = local.getFullYear();
  const m = local.getMonth();
  const d = local.getDate();
  const atNineSameDay = fromZonedTime(
    new Date(y, m, d, QUIET_HOUR_END, 0, 0, 0),
    TIMEZONE,
  );

  if (hour < QUIET_HOUR_END) {
    return atNineSameDay;
  }

  const next = new Date(y, m, d + 1, QUIET_HOUR_END, 0, 0, 0);
  return fromZonedTime(next, TIMEZONE);
}

export function nextStallScheduledAt(lastActivityAt: Date, step: 1 | 2 | 3 | 4): Date {
  const offsetsMs = [
    2 * 60 * 60 * 1000,
    24 * 60 * 60 * 1000,
    72 * 60 * 60 * 1000,
    7 * 24 * 60 * 60 * 1000,
  ];
  const fire = new Date(lastActivityAt.getTime() + offsetsMs[step - 1]!);
  return delayForQuietHours(fire);
}
