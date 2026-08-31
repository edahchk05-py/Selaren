import OpenAI from "openai";
import { z } from "zod";
import { prisma } from "../db";
import { formatSlotLabel } from "../time";
import { listFreeSlots } from "./availability";
import { bookAppointment } from "./appointments";
import { enqueueOutbound } from "./outbox";
import { persistQualification } from "./inquiries";
import {
  applyQualificationPatch,
  assumeCanAttendIfMessagingLocalClinic,
  type QualificationInput,
} from "../qualification";
import { isInsideCustomerCareWindow } from "../window";
import { AI_HALT_REASONS, type AiHaltReason } from "../constants";

const AiJson = z.object({
  language: z.enum(["fr", "darija"]).default("fr"),
  classification: z.string().default("other"),
  halt_reason: z.enum([...AI_HALT_REASONS, "none"]).nullable().optional(),
  qualification: z.object({
    treatment_label: z.string().nullable().optional(),
    matched_treatment_name: z.string().nullable().optional(),
    intent: z.enum(["unknown", "information", "book", "admin"]).optional(),
    can_attend: z.enum(["unknown", "yes", "no"]).optional(),
    notes: z.string().optional(),
    disqualify_reason: z
      .enum([
        "no_intent",
        "cannot_attend",
        "treatment_not_offered",
        "spam",
        "wrong_number",
        "existing_admin_only",
        "other",
      ])
      .nullable()
      .optional(),
  }).optional(),
  reply: z.string().default(""),
  book_slot_start_iso: z.string().nullable().optional(),
});

function client() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 20_000,
  });
}

/** Persisted conversation state is authoritative after the LLM returns. */
async function aiTurnStillAllowed(conversationId: string): Promise<boolean> {
  const row = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { clinic: true, contact: true },
  });
  if (!row) return false;
  if (row.mode !== "ai") return false;
  if (row.clinic.status !== "active") return false;
  if (row.aiHaltReason) return false;
  if (row.contact.waOptOut) return false;
  return true;
}

export async function processAiConversation(conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      clinic: { include: { knowledge: true, treatments: true } },
      contact: true,
      messages: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!conversation) return;

  const claimed = await prisma.conversation.updateMany({
    where: { id: conversationId, needsAiReply: true, mode: "ai" },
    data: { needsAiReply: false },
  });
  if (claimed.count === 0) return;

  if (conversation.clinic.status !== "active") return;
  if (conversation.mode !== "ai") return;
  if (conversation.aiHaltReason) return;
  if (conversation.contact.waOptOut) return;

  if (!isInsideCustomerCareWindow(conversation.lastPatientMessageAt)) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { aiHaltReason: "outside_window" },
    });
    return;
  }

  const inquiry = await prisma.inquiry.findFirst({
    where: { conversationId, status: { in: ["open", "booked"] } },
    include: { qualification: true },
  });
  if (!inquiry) return;

  const slots = await listFreeSlots(conversation.clinicId);
  const slotLines = slots
    .map((s, i) => `${i + 1}. ${formatSlotLabel(s.startAt, s.endAt)} | ISO ${s.startAt.toISOString()}`)
    .join("\n");

  const treatments = conversation.clinic.treatments
    .filter((t) => t.offered)
    .map((t) => `- ${t.name} (${t.category})${t.notes ? `: ${t.notes}` : ""}${t.estimatedValueMad ? ` | tarif: ${t.estimatedValueMad} MAD` : ""}`)
    .join("\n");

  const k = conversation.clinic.knowledge;
  const history = [...conversation.messages].reverse().map((m) => {
    const who =
      m.senderType === "patient"
        ? "patient"
        : m.senderType === "staff"
          ? "accueil"
          : m.senderType === "ai"
            ? "accueil"
            : "systeme";
    return `${who}: ${m.body || (m.mediaType ? `[${m.mediaType}]` : "")}`;
  });

  const system = `Tu aides l'accueil d'une clinique dentaire privée premium au Maroc à convertir une demande WhatsApp en consultation.
Tu n'es PAS un médecin, PAS une réceptionniste IA, PAS Selaren. Tu écris comme l'équipe de la clinique (${conversation.clinic.name}, ${conversation.clinic.city}).
Ne mentionne jamais Selaren. Ne te présente pas comme un agent autonome.

Règles:
- Une seule réponse courte.
- Réponds dans la langue du patient (français ou darija). Si mixte, suis le dernier message.
- N'invente JAMAIS un prix. Tu ne peux citer que ce qui est dans les notes tarifaires / traitements.
- Pas de diagnostic, pas d'interprétation de photos/radio, pas d'avis médical.
- Pas de garantie de résultat, pas de dentiste nommé, pas de CNSS/CNOPS.
- Ne collecte pas de carte, CIN, ni dossier médical.
- Propose 1 à 3 créneaux RÉELS ci-dessous. Ne réserve QUE si le patient accepte UN créneau précis encore libre (renvoie book_slot_start_iso).
- Si le patient dit « oui » sans choisir parmi plusieurs créneaux, demande lequel. Ne choisis pas à sa place.
- Si urgence douleur/gonflement/saignement → halt_reason=medical et dis d'appeler la clinique.
- Si le patient veut une personne → halt_reason=patient_requests_human.
- Si colère / menace → halt_reason=angry_or_complaint.
- Si prix exigé et absent des notes → halt_reason=missing_price et propose une consultation.
- Qualification: intérêt traitement + intent=book + can_attend. Si le patient écrit au numéro local et ne dit pas qu'il ne peut pas venir, can_attend=yes.

Connaissance:
À propos: ${k?.aboutText ?? ""}
Ton: ${k?.tone ?? "professionnel, chaleureux"}
Tarifs (ne pas inventer hors de ce texte): ${k?.pricingNotes ?? ""}
FAQ: ${k?.faqs ?? ""}
Politiques: ${k?.policies ?? ""}
Règles de RDV: ${k?.bookingRules ?? ""}
Ne pas dire: ${k?.doNotSay ?? ""}

Traitements proposés:
${treatments || "(aucun)"}

Créneaux libres (14 jours, heure Casablanca):
${slotLines || "(aucun créneau)"}

Qualification actuelle: ${JSON.stringify(inquiry.qualification)}

Réponds UNIQUEMENT en JSON:
{
  "language": "fr" | "darija",
  "classification": "greeting|treatment|price|booking|reschedule|cancel|human|medical|spam|admin|other",
  "halt_reason": null | "patient_requests_human|medical|missing_price|booking_conflict|angry_or_complaint|low_confidence|spam...",
  "qualification": {
    "treatment_label": string|null,
    "matched_treatment_name": string|null,
    "intent": "unknown|information|book|admin",
    "can_attend": "unknown|yes|no",
    "notes": string,
    "disqualify_reason": null|string
  },
  "reply": "texte WhatsApp",
  "book_slot_start_iso": string|null
}`;

  let parsed: z.infer<typeof AiJson> | null = null;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
      const res = await client().chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: history.join("\n") || "Nouveau message." },
        ],
      });
      const raw = res.choices[0]?.message?.content ?? "{}";
      parsed = AiJson.parse(JSON.parse(raw));
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!parsed) {
    if (await aiTurnStillAllowed(conversationId)) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { aiHaltReason: "ai_provider_error" },
      });
    }
    console.error("ai_provider_error", lastErr);
    return;
  }

  const halt = parsed.halt_reason && parsed.halt_reason !== "none" ? (parsed.halt_reason as AiHaltReason) : null;

  if (!(await aiTurnStillAllowed(conversationId))) return;

  if (halt) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { aiHaltReason: halt },
    });
    return;
  }

  if (inquiry.qualification && !inquiry.qualification.lockedByStaff && parsed.qualification) {
    const current: QualificationInput = {
      status: inquiry.qualification.status,
      treatmentId: inquiry.qualification.treatmentId,
      treatmentLabel: inquiry.qualification.treatmentLabel,
      intent: inquiry.qualification.intent,
      canAttendClinic: inquiry.qualification.canAttendClinic,
      disqualifyReason: inquiry.qualification.disqualifyReason,
      notes: inquiry.qualification.notes,
      lockedByStaff: false,
    };
    const matched = conversation.clinic.treatments.find(
      (t) =>
        t.offered &&
        parsed.qualification?.matched_treatment_name &&
        t.name.toLowerCase() === parsed.qualification.matched_treatment_name.toLowerCase(),
    );
    const byLabel = conversation.clinic.treatments.find(
      (t) =>
        t.offered &&
        parsed.qualification?.treatment_label &&
        t.name.toLowerCase().includes(parsed.qualification.treatment_label.toLowerCase()),
    );
    const treatment = matched ?? byLabel;
    const canAttend = assumeCanAttendIfMessagingLocalClinic(
      parsed.qualification.can_attend ?? current.canAttendClinic,
    );
    const next = applyQualificationPatch(
      current,
      {
        treatmentId: treatment?.id ?? current.treatmentId,
        treatmentLabel:
          parsed.qualification.treatment_label ??
          treatment?.name ??
          current.treatmentLabel,
        intent: parsed.qualification.intent ?? current.intent,
        canAttendClinic: canAttend,
        notes: parsed.qualification.notes
          ? `${current.notes}\n${parsed.qualification.notes}`.trim()
          : current.notes,
        disqualifyReason: parsed.qualification.disqualify_reason ?? current.disqualifyReason,
      },
      { byStaff: false },
    );
    await persistQualification(inquiry.id, conversation.clinicId, next, null);
  }

  if (conversation.contact.language === "unknown" && parsed.language) {
    await prisma.contact.update({
      where: { id: conversation.contactId },
      data: { language: parsed.language === "darija" ? "ar" : "fr" },
    });
  }

  if (parsed.book_slot_start_iso) {
    if (!(await aiTurnStillAllowed(conversationId))) return;
    const slot = slots.find((s) => s.startAt.toISOString() === parsed.book_slot_start_iso);
    if (!slot) {
      if (!(await aiTurnStillAllowed(conversationId))) return;
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { aiHaltReason: "booking_conflict", needsAiReply: false },
      });
      if (parsed.reply.trim()) {
        await enqueueOutbound({
          clinicId: conversation.clinicId,
          conversationId,
          inquiryId: inquiry.id,
          senderType: "ai",
          body: parsed.reply.trim(),
        });
      }
      return;
    }
    try {
      await bookAppointment({
        clinicId: conversation.clinicId,
        inquiryId: inquiry.id,
        startAt: slot.startAt,
        endAt: slot.endAt,
        userId: null,
        byAi: true,
      });
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { aiHaltReason: null },
      });
      return;
    } catch {
      if (!(await aiTurnStillAllowed(conversationId))) return;
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { aiHaltReason: "booking_conflict" },
      });
      const retrySlots = await listFreeSlots(conversation.clinicId);
      const offer = retrySlots
        .slice(0, 3)
        .map((s) => formatSlotLabel(s.startAt, s.endAt))
        .join(" ; ");
      await enqueueOutbound({
        clinicId: conversation.clinicId,
        conversationId,
        inquiryId: inquiry.id,
        senderType: "ai",
        body: offer
          ? `Ce créneau vient d'être pris. Souhaitez-vous l'un de ces horaires : ${offer} ?`
          : "Ce créneau n'est plus disponible. Un membre de l'équipe va vous proposer un autre horaire.",
      });
      return;
    }
  }

  const reply = parsed.reply.trim();
  if (!reply) return;

  if (!(await aiTurnStillAllowed(conversationId))) return;

  await enqueueOutbound({
    clinicId: conversation.clinicId,
    conversationId,
    inquiryId: inquiry.id,
    senderType: "ai",
    body: reply,
  });
}
