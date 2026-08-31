import { describe, expect, it } from "vitest";
import { delayForQuietHours } from "../src/lib/quietHours";
import { fromZonedTime } from "date-fns-tz";

describe("quiet hours", () => {
  it("delays 21:30 Casablanca to next 09:00", () => {
    const at = fromZonedTime("2026-08-31 21:30:00", "Africa/Casablanca");
    const delayed = delayForQuietHours(at);
    const local = delayed.toLocaleString("fr-MA", { timeZone: "Africa/Casablanca", hour: "2-digit", hour12: false });
    expect(local.startsWith("09") || local.includes("09")).toBe(true);
  });

  it("does not delay 10:00", () => {
    const at = fromZonedTime("2026-08-31 10:00:00", "Africa/Casablanca");
    expect(delayForQuietHours(at).getTime()).toBe(at.getTime());
  });
});
