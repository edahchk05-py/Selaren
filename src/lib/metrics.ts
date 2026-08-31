export type InquiryMetricRow = {
  createdAt: Date;
  closedReason: "unresponsive" | "not_interested" | "spam" | "duplicate" | "other" | null;
  qualifiedAt: Date | null;
  bookedAt: Date | null;
  firstResponseAt: Date | null;
  recovered: boolean;
  hasDepositedAppointment: boolean;
};

export type AppointmentMetricRow = {
  startAt: Date;
  status: "scheduled" | "cancelled" | "rescheduled";
  attendance: "pending" | "showed" | "no_show";
  depositStatus: "none" | "deposited";
  depositedAt: Date | null;
  updatedAt: Date;
  estimatedValueMad: number | null;
  clinicDefaultValueMad: number;
  inquiryId: string | null;
};

export function inRange(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 0) return (s[mid - 1]! + s[mid]!) / 2;
  return s[mid]!;
}

export function isOutcomePending(row: AppointmentMetricRow, now: Date): boolean {
  return (
    row.status === "scheduled" &&
    row.attendance === "pending" &&
    now.getTime() >= row.startAt.getTime() + 24 * 60 * 60 * 1000
  );
}

export function computeDashboard(args: {
  rangeStart: Date;
  rangeEnd: Date;
  now: Date;
  inquiries: InquiryMetricRow[];
  appointments: AppointmentMetricRow[];
  followUpsSentInRange: number;
  inquiriesWithFollowUpInCohort: number;
}) {
  const cohort = args.inquiries.filter((i) => i.closedReason !== "duplicate");
  const inquiries = cohort.length;
  const qualified = cohort.filter((i) => i.qualifiedAt).length;
  const booked = cohort.filter((i) => i.bookedAt).length;
  const depositsCohort = cohort.filter((i) => i.hasDepositedAppointment).length;
  const recovered = cohort.filter((i) => i.recovered).length;
  const unanswered = cohort.filter((i) => !i.firstResponseAt).length;
  const responseMinutes = cohort
    .filter((i) => i.firstResponseAt)
    .map((i) => (i.firstResponseAt!.getTime() - i.createdAt.getTime()) / 60000);

  const ops = args.appointments.filter((a) => a.status !== "rescheduled");
  const noShows = ops.filter((a) => a.attendance === "no_show").length;
  const showed = ops.filter((a) => a.attendance === "showed").length;
  const outcomePending = ops.filter((a) => isOutcomePending(a, args.now)).length;
  const cancelled = args.appointments.filter((a) => a.status === "cancelled").length;

  const northStar = args.appointments.filter((a) => {
    if (a.depositStatus !== "deposited" || !a.inquiryId) return false;
    const when = a.depositedAt ?? a.updatedAt;
    return inRange(when, args.rangeStart, args.rangeEnd);
  });

  const estimatedRevenue = northStar.reduce((sum, a) => {
    return sum + (a.estimatedValueMad ?? a.clinicDefaultValueMad);
  }, 0);

  const conversionRate = inquiries > 0 ? booked / inquiries : 0;
  const qualifiedRate = inquiries > 0 ? qualified / inquiries : 0;
  const bookingRate = qualified > 0 ? booked / qualified : inquiries > 0 ? booked / inquiries : 0;
  const depositRate = booked > 0 ? depositsCohort / booked : 0;
  const showUpRate = showed + noShows > 0 ? showed / (showed + noShows) : null;

  return {
    northStar: northStar.length,
    inquiries,
    qualifiedInquiries: qualified,
    bookedAppointments: booked,
    deposits: depositsCohort,
    followUpsSent: args.followUpsSentInRange,
    inquiriesWithFollowUp: args.inquiriesWithFollowUpInCohort,
    noShows,
    outcomePending,
    cancelledAppointments: cancelled,
    conversionRate,
    qualifiedInquiryRate: qualifiedRate,
    bookingRate,
    depositRate,
    showUpRate,
    medianFirstResponseMinutes: median(responseMinutes),
    unanswered,
    recoveredInquiries: recovered,
    showed,
    estimatedRevenueGenerated: estimatedRevenue,
  };
}

export function dateRangeCasablanca(
  preset: "today" | "7d" | "14d" | "30d" | "custom",
  now: Date,
  customStart?: Date,
  customEnd?: Date,
  ymdInZone?: (d: Date) => string,
  startOfYmd?: (ymd: string) => Date,
  endOfYmd?: (ymd: string) => Date,
): { start: Date; end: Date } {
  if (preset === "custom" && customStart && customEnd) {
    return { start: customStart, end: customEnd };
  }
  if (!ymdInZone || !startOfYmd || !endOfYmd) {
    const end = now;
    const days = preset === "today" ? 0 : preset === "7d" ? 6 : preset === "30d" ? 29 : 13;
    const start = new Date(now.getTime() - days * 86400000);
    return { start, end };
  }
  const today = ymdInZone(now);
  const end = endOfYmd(today);
  if (preset === "today") return { start: startOfYmd(today), end };
  const days = preset === "7d" ? 6 : preset === "30d" ? 29 : 13;
  const startDate = new Date(startOfYmd(today).getTime() - days * 86400000);
  return { start: startOfYmd(ymdInZone(startDate)), end };
}
