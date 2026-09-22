import { describe, expect, it } from "vitest";
import {
  detectLanguage,
  existingAppointmentReply,
  isQualifiedForBooking,
  isRecoverableHalt,
  missingQualification,
  qualificationQuestion,
  replyOffersAppointmentSlots,
  replyViolations,
  requiresStaff,
  selectSlotsForAi,
} from "../src/lib/aiPolicy";
import type { FreeSlot } from "../src/lib/slots";

function slot(startIso: string): FreeSlot {
  const startAt = new Date(startIso);
  return { startAt, endAt: new Date(startAt.getTime() + 30 * 60 * 1000) };
}

const slots = [
  slot("2026-09-21T08:00:00.000Z"),
  slot("2026-09-21T08:30:00.000Z"),
  slot("2026-09-21T09:00:00.000Z"),
  slot("2026-09-22T08:00:00.000Z"),
  slot("2026-09-22T08:30:00.000Z"),
  slot("2026-09-22T09:00:00.000Z"),
  slot("2026-09-23T08:00:00.000Z"),
  slot("2026-09-23T08:30:00.000Z"),
  slot("2026-09-23T09:00:00.000Z"),
];

describe("AI availability selection", () => {
  it("distributes generic offers across multiple days", () => {
    const selected = selectSlotsForAi(slots, "Je souhaite prendre rendez-vous", 6);
    const days = new Set(selected.slots.map((item) => item.startAt.toISOString().slice(0, 10)));
    expect(days.size).toBe(3);
  });

  it("honors a requested weekday instead of claiming only the first day exists", () => {
    const selected = selectSlotsForAi(slots, "Mardi ?", 6);
    expect(selected.slots).toHaveLength(3);
    expect(selected.slots.every((item) => item.startAt.toISOString().startsWith("2026-09-22"))).toBe(true);
    expect(selected.requestContext).toMatch(/mardi/);
  });

  it("reports no exact evening match but keeps same-day alternatives", () => {
    const selected = selectSlotsForAi(slots, "Lundi soir", 6);
    expect(selected.slots.every((item) => item.startAt.toISOString().startsWith("2026-09-21"))).toBe(true);
    expect(selected.requestContext).toMatch(/Aucun créneau/);
  });
});

describe("AI booking policy", () => {
  const base = {
    treatmentId: null,
    treatmentLabel: null,
    intent: "book" as const,
    canAttendClinic: "yes" as const,
    disqualifyReason: null,
  };

  it("does not consider booking ready without a treatment", () => {
    expect(isQualifiedForBooking(base)).toBe(false);
    expect(missingQualification(base)).toBe("treatment");
    expect(qualificationQuestion(base, "fr")).toMatch(/quel traitement/i);
  });

  it("asks for the missing step only, in order", () => {
    expect(missingQualification({ ...base, treatmentLabel: "Implant", intent: "information" })).toBe("intent");
    expect(
      missingQualification({ ...base, treatmentLabel: "Implant", canAttendClinic: "unknown" }),
    ).toBe("attendance");
  });

  it("allows booking only after treatment, intent, and attendance are known", () => {
    expect(isQualifiedForBooking({ ...base, treatmentLabel: "Implant" })).toBe(true);
    expect(missingQualification({ ...base, treatmentLabel: "Implant" })).toBeNull();
  });

  it("detects concrete slot offers", () => {
    expect(replyOffersAppointmentSlots("Je peux vous proposer lundi à 10h.")).toBe(true);
    expect(replyOffersAppointmentSlots("Les choix sont 09h ou 10h.")).toBe(true);
    expect(replyOffersAppointmentSlots("Pouvez-vous préciser votre besoin ?")).toBe(false);
  });

  it("routes appointment changes to staff in the patient's language", () => {
    expect(existingAppointmentReply("lundi à 10:00", "fr")).toMatch(/déjà un rendez-vous/);
    expect(existingAppointmentReply("الاثنين 10:00", "darija")).toMatch(/ديجا موعد/);
  });
});

describe("halt recovery classification", () => {
  it("recovers on its own from transient halts", () => {
    for (const reason of [
      "ai_provider_error",
      "media_only",
      "outside_window",
      "booking_conflict",
      "follow_up_exhausted",
      "low_confidence",
    ]) {
      expect(isRecoverableHalt(reason)).toBe(true);
      expect(requiresStaff(reason)).toBe(false);
    }
  });

  it("keeps halts that genuinely need a human", () => {
    for (const reason of ["medical", "patient_requests_human", "missing_price", "angry_or_complaint"]) {
      expect(requiresStaff(reason)).toBe(true);
      expect(isRecoverableHalt(reason)).toBe(false);
    }
  });

  it("treats no halt as nothing to recover", () => {
    expect(isRecoverableHalt(null)).toBe(false);
    expect(requiresStaff(undefined)).toBe(false);
  });
});

describe("patient language detection", () => {
  it("follows the patient's script", () => {
    expect(detectLanguage("بغيت نحجز موعد")).toBe("darija");
    expect(detectLanguage("Je veux un rendez-vous")).toBe("fr");
  });

  it("recognises latin-script darija", () => {
    expect(detectLanguage("salam, bghit nahjez")).toBe("darija");
  });
});

describe("reply policy checks", () => {
  const ctx = {
    expectedLanguage: "fr" as const,
    lastAiReply: null,
    qualified: true,
    hasExistingAppointment: false,
  };

  it("accepts a natural compliant reply", () => {
    expect(replyViolations({ ...ctx, reply: "Parfait, je vous propose mardi à 10:00." })).toEqual([]);
  });

  it("rejects slot offers before qualification", () => {
    const problems = replyViolations({
      ...ctx,
      qualified: false,
      reply: "Nous avons mardi à 10:00 ou mercredi à 11:00.",
    });
    expect(problems.join(" ")).toMatch(/qualification/i);
  });

  it("rejects a reply that switches away from the patient's language", () => {
    const problems = replyViolations({
      ...ctx,
      expectedLanguage: "darija",
      reply: "Nous vous proposons une consultation.",
    });
    expect(problems.join(" ")).toMatch(/darija/i);
  });

  it("rejects repeating the previous message", () => {
    const previous = "Quel traitement vous intéresse exactement ?";
    const problems = replyViolations({ ...ctx, lastAiReply: previous, reply: previous });
    expect(problems.join(" ")).toMatch(/répète/i);
  });

  it("rejects announcing a second appointment", () => {
    const problems = replyViolations({
      ...ctx,
      hasExistingAppointment: true,
      reply: "Je vous crée un nouveau rendez-vous.",
    });
    expect(problems.join(" ")).toMatch(/modification/i);
  });

  it("rejects empty and overlong replies", () => {
    expect(replyViolations({ ...ctx, reply: "   " })).toHaveLength(1);
    expect(replyViolations({ ...ctx, reply: "a".repeat(800) }).join(" ")).toMatch(/trop longue/i);
  });

  it("rejects revealing itself as an AI", () => {
    const problems = replyViolations({ ...ctx, reply: "En tant qu'IA, je ne peux pas." });
    expect(problems.join(" ")).toMatch(/IA/);
  });
});
