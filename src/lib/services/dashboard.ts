import { prisma } from "../db";
import { computeDashboard } from "../metrics";
import { casablancaDateTime, ymdInCasablanca, addDaysYmd } from "../time";

export async function clinicDashboard(
  clinicId: string,
  rangeStart: Date,
  rangeEnd: Date,
  now = new Date(),
) {
  const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } });
  const defaultValue = Number(clinic.defaultConsultationValueMad ?? 0);

  const inquiries = await prisma.inquiry.findMany({
    where: { clinicId, createdAt: { gte: rangeStart, lte: rangeEnd } },
    include: {
      appointments: true,
      followUps: true,
    },
  });

  const appointments = await prisma.appointment.findMany({
    where: { clinicId, startAt: { gte: rangeStart, lte: rangeEnd } },
    include: { inquiry: true },
  });

  const followUpsSentInRange = await prisma.followUp.count({
    where: { clinicId, sentAt: { gte: rangeStart, lte: rangeEnd } },
  });

  const inquiryRows = inquiries.map((i) => ({
    createdAt: i.createdAt,
    closedReason: i.closedReason,
    qualifiedAt: i.qualifiedAt,
    bookedAt: i.bookedAt,
    firstResponseAt: i.firstResponseAt,
    recovered: i.followUps.some((f) => f.sentAt) && Boolean(i.bookedAt),
    hasDepositedAppointment: i.appointments.some((a) => a.depositStatus === "deposited"),
  }));

  const apptRows = appointments.map((a) => ({
    startAt: a.startAt,
    status: a.status,
    attendance: a.attendance,
    depositStatus: a.depositStatus,
    depositedAt: a.depositedAt,
    updatedAt: a.depositedAt ?? a.createdAt,
    estimatedValueMad: a.inquiry.estimatedValueMad ? Number(a.inquiry.estimatedValueMad) : null,
    clinicDefaultValueMad: defaultValue,
    inquiryId: a.inquiryId,
  }));

  const metrics = computeDashboard({
    rangeStart,
    rangeEnd,
    now,
    inquiries: inquiryRows,
    appointments: apptRows,
    followUpsSentInRange,
    inquiriesWithFollowUpInCohort: inquiryRows.filter((i) =>
      inquiries.find(
        (x) =>
          x.createdAt.getTime() === i.createdAt.getTime() &&
          x.followUps.some((f) => f.sentAt) &&
          x.closedReason !== "duplicate",
      ),
    ).length,
  });

  const deposited = await prisma.appointment.findMany({
    where: { clinicId, depositStatus: "deposited" },
  });
  const northStarExact = deposited.filter((a) => {
    const when = a.depositedAt ?? a.createdAt;
    return when >= rangeStart && when <= rangeEnd;
  }).length;

  return { ...metrics, northStar: northStarExact };
}

export function defaultFourteenDayRange(now = new Date()) {
  const today = ymdInCasablanca(now);
  const startYmd = addDaysYmd(today, -13);
  return {
    start: casablancaDateTime(startYmd, "00:00:00"),
    end: casablancaDateTime(today, "23:59:59"),
  };
}
