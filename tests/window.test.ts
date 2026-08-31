import { describe, expect, it } from "vitest";
import { isInsideCustomerCareWindow } from "../src/lib/window";

describe("24h window", () => {
  it("is open just after patient message", () => {
    const t = new Date();
    expect(isInsideCustomerCareWindow(t, t)).toBe(true);
  });
  it("is closed after 24h", () => {
    const last = new Date("2026-08-01T10:00:00Z");
    const now = new Date("2026-08-02T11:00:00Z");
    expect(isInsideCustomerCareWindow(last, now)).toBe(false);
  });
  it("is closed if never messaged", () => {
    expect(isInsideCustomerCareWindow(null)).toBe(false);
  });
});
