import { describe, expect, it } from "vitest";
import { computeDashboard, median } from "../src/lib/metrics";

describe("metrics", () => {
  it("uses median not average for response time", () => {
    expect(median([1, 10, 100])).toBe(10);
  });

  it("excludes duplicates and pending from show-up rate", () => {
    const start = new Date("2026-08-01T00:00:00Z");
    const end = new Date("2026-08-31T23:59:59Z");
    const now = new Date("2026-08-20T12:00:00Z");
    const m = computeDashboard({
      rangeStart: start,
      rangeEnd: end,
      now,
      inquiries: [
        {
          createdAt: new Date("2026-08-10"),
          closedReason: "duplicate",
          qualifiedAt: new Date(),
          bookedAt: new Date(),
          firstResponseAt: new Date(),
          recovered: false,
          hasDepositedAppointment: false,
        },
        {
          createdAt: new Date("2026-08-10"),
          closedReason: null,
          qualifiedAt: new Date("2026-08-10"),
          bookedAt: new Date("2026-08-11"),
          firstResponseAt: new Date("2026-08-10"),
          recovered: true,
          hasDepositedAppointment: true,
        },
      ],
      appointments: [
        {
          startAt: new Date("2026-08-12"),
          status: "scheduled",
          attendance: "showed",
          depositStatus: "deposited",
          depositedAt: new Date("2026-08-11"),
          updatedAt: new Date("2026-08-11"),
          estimatedValueMad: 5000,
          clinicDefaultValueMad: 2000,
          inquiryId: "i1",
        },
        {
          startAt: new Date("2026-08-12"),
          status: "scheduled",
          attendance: "pending",
          depositStatus: "none",
          depositedAt: null,
          updatedAt: new Date(),
          estimatedValueMad: null,
          clinicDefaultValueMad: 2000,
          inquiryId: "i2",
        },
      ],
      followUpsSentInRange: 3,
      inquiriesWithFollowUpInCohort: 1,
    });
    expect(m.inquiries).toBe(1);
    expect(m.showUpRate).toBe(1);
    expect(m.northStar).toBe(1);
    expect(m.estimatedRevenueGenerated).toBe(5000);
    expect(m.recoveredInquiries).toBe(1);
  });
});
