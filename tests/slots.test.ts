import { describe, expect, it } from "vitest";
import { generateFreeSlots } from "../src/lib/slots";

describe("slots", () => {
  it("skips disabled days, blocked time, and occupied slots", () => {
    const now = new Date("2026-08-31T08:00:00.000Z");
    const hours = [
      { weekday: 0, enabled: true, startTime: "09:00:00", endTime: "11:00:00" },
      { weekday: 1, enabled: false, startTime: "09:00:00", endTime: "18:00:00" },
    ];
    const slots = generateFreeSlots({
      now,
      slotMinutes: 30,
      hours,
      blocked: [],
      occupied: [],
      leadMinutes: 0,
      windowDays: 2,
      limit: 12,
    });
    expect(slots.length).toBeGreaterThan(0);
    const occupied = generateFreeSlots({
      now,
      slotMinutes: 30,
      hours,
      blocked: [],
      occupied: [{ startAt: slots[0]!.startAt, endAt: slots[0]!.endAt }],
      leadMinutes: 0,
      windowDays: 2,
      limit: 12,
    });
    expect(occupied[0]?.startAt.getTime()).not.toBe(slots[0]!.startAt.getTime());
  });
});
