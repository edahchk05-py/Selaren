import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { TIMEZONE } from "./constants";

export function nowUtc(): Date {
  return new Date();
}

export function toCasablanca(date: Date): Date {
  return toZonedTime(date, TIMEZONE);
}

export function fromCasablancaLocal(isoLocal: string): Date {
  return fromZonedTime(isoLocal, TIMEZONE);
}

/** Combine a Casablanca calendar date (YYYY-MM-DD) with a time (HH:mm or HH:mm:ss). */
export function casablancaDateTime(dateYmd: string, timeHms: string): Date {
  const time = timeHms.length === 5 ? `${timeHms}:00` : timeHms;
  return fromZonedTime(`${dateYmd} ${time}`, TIMEZONE);
}

export function ymdInCasablanca(date: Date): string {
  const z = toZonedTime(date, TIMEZONE);
  const y = z.getFullYear();
  const m = String(z.getMonth() + 1).padStart(2, "0");
  const d = String(z.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatCasablanca(date: Date, opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("fr-MA", {
    timeZone: TIMEZONE,
    ...opts,
  }).format(date);
}

export function formatSlotLabel(start: Date, end: Date): string {
  const day = formatCasablanca(start, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const t1 = formatCasablanca(start, { hour: "2-digit", minute: "2-digit" });
  const t2 = formatCasablanca(end, { hour: "2-digit", minute: "2-digit" });
  return `${day} ${t1}–${t2}`;
}

export function isoWeekdayMon0(date: Date): number {
  const z = toZonedTime(date, TIMEZONE);
  const js = z.getDay();
  return js === 0 ? 6 : js - 1;
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function timeFromDb(value: Date | string): string {
  if (typeof value === "string") {
    return value.slice(0, 8);
  }
  const hh = String(value.getUTCHours()).padStart(2, "0");
  const mm = String(value.getUTCMinutes()).padStart(2, "0");
  const ss = String(value.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
