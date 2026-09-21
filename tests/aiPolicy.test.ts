import { describe, expect, it } from "vitest";
import {
  existingAppointmentReply,
  isQualifiedForBooking,
  qualificationQuestion,
  replyOffersAppointmentSlots,
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
    expect(
      qualificationQuestion(
        { ...base, canAttendClinic: "yes" },
        "fr",
      ),
    ).toMatch(/quel traitement/i);
  });

  it("allows booking only after treatment, intent, and attendance are known", () => {
    expect(isQualifiedForBooking({ ...base, treatmentLabel: "Implant" })).toBe(true);
  });

  it("detects concrete single and multiple-time slot offers", () => {
    expect(replyOffersAppointmentSlots("Je peux vous proposer lundi à 10h.")).toBe(true);
    expect(replyOffersAppointmentSlots("Les choix sont 09h ou 10h.")).toBe(true);
    expect(replyOffersAppointmentSlots("Pouvez-vous préciser votre besoin ?")).toBe(false);
  });

  it("routes appointment changes to staff in the patient's language", () => {
    expect(existingAppointmentReply("lundi à 10:00", "fr")).toMatch(/déjà un rendez-vous/);
    expect(existingAppointmentReply("الاثنين 10:00", "darija")).toMatch(/ديجا موعد/);
  });
});
