import { describe, expect, it } from "vitest";
import { canActivate, activationGaps, knowledgeComplete } from "../src/lib/activation";

describe("activation", () => {
  it("blocks incomplete clinics", () => {
    const incomplete = {
      name: "Clinique Test",
      city: "casablanca" as const,
      defaultConsultationValueMad: 0,
      ownerCount: 0,
      offeredTreatmentCount: 0,
      knowledgeComplete: false,
      enabledWeekdays: 0,
      whatsappActive: false,
      templatesReady: false,
      sessionOnlyPilot: false,
    };
    expect(activationGaps(incomplete).length).toBeGreaterThan(3);
    expect(canActivate(incomplete)).toBe(false);
  });

  it("knowledge requires all fields", () => {
    expect(
      knowledgeComplete({
        aboutText: "a",
        tone: "b",
        pricingNotes: "c",
        faqs: "d",
        policies: "e",
        bookingRules: "f",
        doNotSay: "g",
      }),
    ).toBe(true);
    expect(
      knowledgeComplete({
        aboutText: "",
        tone: "b",
        pricingNotes: "c",
        faqs: "d",
        policies: "e",
        bookingRules: "f",
        doNotSay: "g",
      }),
    ).toBe(false);
  });
});
