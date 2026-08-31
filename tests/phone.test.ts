import { describe, expect, it } from "vitest";
import { normalizePhoneE164, isValidE164 } from "../src/lib/phone";

describe("phone", () => {
  it("normalizes Moroccan local numbers", () => {
    expect(normalizePhoneE164("0612345678")).toBe("+212612345678");
    expect(normalizePhoneE164("06 12 34 56 78")).toBe("+212612345678");
    expect(normalizePhoneE164("+212612345678")).toBe("+212612345678");
    expect(normalizePhoneE164("212612345678")).toBe("+212612345678");
  });

  it("rejects junk", () => {
    expect(normalizePhoneE164("")).toBeNull();
    expect(normalizePhoneE164("12")).toBeNull();
  });

  it("validates e164", () => {
    expect(isValidE164("+212612345678")).toBe(true);
    expect(isValidE164("0612345678")).toBe(false);
  });
});
