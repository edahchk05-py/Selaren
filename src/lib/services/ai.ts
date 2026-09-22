import OpenAI from "openai";
import { z } from "zod";
import { prisma } from "../db";
import { formatSlotLabel } from "../time";
import { listFreeSlots } from "./availability";
import { bookAppointment, rescheduleAppointment } from "./appointments";
import { enqueueOutbound } from "./outbox";
import { persistQualification } from "./inquiries";
import {
  applyQualificationPatch,
  assumeCanAttendIfMessagingLocalClinic,
  type QualificationInput,
} from "../qualification";
import { isInsideCustomerCareWindow } from "../window";
import { AI_HALT_REASONS, type AiHaltReason } from "../constants";
import {
  cancelHandoffReply,
  detectLanguage,
  isQualifiedForBooking,
  missingQualification,
  qualificationQuestion,
  replyViolations,
  selectSlotsForAi,
  slotTakenReply,
  staffHandoffReply,
  type Language,
} from "../aiPolicy";
import { claimAiTurn, releaseAiTurn } from "../jobs/claim";

const AiJson = z.object({
  language: z.enum(["fr", "darija"]).default("fr"),
  classification: z.string().default("other"),
  halt_reason: z.enum([...AI_HALT_REASONS, "none"]).nullable().optional(),
  qualification: z
    .object({
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
    })
    .optional(),
  reply: z.string().default(""),
  book_slot_start_iso: z.string().nullable().optional(),
  reschedule_slot_start_iso: z.string().nullable().optional(),
});

type AiParsed = z.infer<typeof AiJson>;

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

async function halt(conversationId: string, reason: AiHaltReason) {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { aiHaltReason: reason, needsAiReply: false },
  });
}

/**
 * One AI turn. The claim is taken before the model call and released at the
 * end, so a worker that dies mid-turn leaves a stale claim the next tick
 * requeues instead of dropping the patient's message.
 */
export async function processAiConversation(conversationId: string) {
  if (!(await claimAiTurn(conversationId))) return;
  try {
    await runAiTurn(conversationId);
  } catch (err) {
    console.error("ai_turn_failed", err);
    if (await aiTurnStillAllowed(conversationId)) {
      await halt(conversationId, "ai_provider_error");
    }
  } finally {
    await releaseAiTurn(conversationId);
  }
}

async function runAiTurn(conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      clinic: { include: { knowledge: true, treatments: true } },
      contact: true,
      messages: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!conversation) return;

  if (conversation.clinic.status !== "active") return;
  if (conversation.mode !== "ai") return;
  if (conversation.aiHaltReason) return;
  if (conversation.contact.waOptOut) return;

  if (!isInsideCustomerCareWindow(conversation.lastPatientMessageAt)) {
    await halt(conversationId, "outside_window");
    return;
  }

  const inquiry = await prisma.inquiry.findFirst({
    where: { conversationId, status: { in: ["open", "booked"] } },
    include: { qualification: true },
  });
  if (!inquiry) return;

  const existingAppointment = await prisma.appointment.findFirst({
    where: { contactId: conversation.contactId, status: "scheduled" },
    orderBy: { startAt: "asc" },
  });

  const latestPatientText =
    conversation.messages.find((m) => m.senderType === "patient")?.body ?? "";
  const lastAiReply =
    conversation.messages.find((m) => m.direction === "outbound" && m.senderType === "ai")?.body ??
    null;
  const language: Language = detectLanguage(
    latestPatientText,
    conversation.contact.language === "ar" ? "darija" : "fr",
  );

  const allSlots = await listFreeSlots(conversation.clinicId, new Date(), false, 1000);
  const slotSelection = selectSlotsForAi(allSlots, latestPatientText);
  const slots = slotSelection.slots;
  const slotLines = slots
    .map((s, i) => `${i + 1}. ${formatSlotLabel(s.startAt, s.endAt)} | ISO ${s.startAt.toISOString()}`)
    .join("\n");

  const treatments = conversation.clinic.treatments
    .filter((t) => t.offered)
    .map(
      (t) =>
        `- ${t.name} (${t.category})${t.notes ? `: ${t.notes}` : ""}${t.estimatedValueMad ? ` | tarif: ${t.estimatedValueMad} MAD` : ""}`,
    )
    .join("\n");

  const missing = inquiry.qualification ? missingQualification(inquiry.qualification) : "treatment";
  const missingLabel =
    missing === "treatment"
      ? "le traitement souhaité n'est pas encore identifié"
      : missing === "intent"
        ? "le patient n'a pas encore confirmé vouloir réserver"
        : missing === "attendance"
          ? "le patient n'a pas confirmé pouvoir venir à la clinique"
          : "rien, la qualification est complète";

  const k = conversation.clinic.knowledge;
  const history = [...conversation.messages].reverse().map((m) => {
    const who =
      m.senderType === "patient"
        ? "patient"
        : m.senderType === "staff" || m.senderType === "ai"
          ? "accueil"
          : "systeme";
    return `${who}: ${m.body || (m.mediaType ? `[${m.mediaType}]` : "")}`;
  });

  const languageRule =
    language === "darija"
      ? "Le patient écrit en darija : réponds en darija marocaine avec l'alphabet arabe. Jamais d'arabe standard, jamais de français."
      : "Le patient écrit en français : réponds uniquement en français.";

  const system = `Tu écris les messages WhatsApp de l'accueil d'une clinique dentaire privée premium au Maroc (${conversation.clinic.name}, ${conversation.clinic.city}). Ton objectif : transformer une demande en consultation à la clinique.
Tu n'es PAS un médecin. Ne dis jamais que tu es une IA. Ne mentionne jamais Selaren.

Style:
- 1 à 3 phrases courtes, ton humain, chaleureux et direct.
- Une seule question par message, celle qui fait avancer.
- Pas de liste à puces, pas d'emoji, pas de formule administrative.
- Ne dis « Bonjour » que si c'est le premier message de la conversation.
- Reprends les mots du patient. Ne répète jamais ton message précédent.
- ${languageRule}

Interdits absolus:
- N'invente JAMAIS un prix : seuls les tarifs présents ci-dessous existent.
- Pas de diagnostic, pas d'interprétation de photo/radio, pas d'avis médical.
- Pas de garantie de résultat, pas de dentiste nommé, pas de CNSS/CNOPS.
- Ne demande ni carte bancaire, ni CIN, ni dossier médical.

Qualification avant tout horaire:
- Il faut le traitement souhaité + la volonté de réserver + la possibilité de venir.
- Actuellement il manque : ${missingLabel}.
- Tant qu'il manque quelque chose, ne cite AUCUN horaire : pose la question manquante.
- Si le patient écrit au numéro local et ne dit pas le contraire, can_attend=yes.

Créneaux:
- Propose au maximum 3 créneaux, uniquement ceux de la liste ci-dessous.
- Réserve (book_slot_start_iso) seulement si le patient accepte UN horaire précis de la liste.
- Si le patient dit « oui » sans choisir, demande lequel.
${
  existingAppointment
    ? `- Le patient a DÉJÀ un rendez-vous (${formatSlotLabel(existingAppointment.startAt, existingAppointment.endAt)}). Ne crée jamais un second rendez-vous. S'il veut un autre horaire, c'est une MODIFICATION : renvoie reschedule_slot_start_iso avec un créneau de la liste.
- S'il veut annuler, dis que l'accueil confirme l'annulation et n'annule rien toi-même.`
    : "- Le patient n'a aucun rendez-vous en cours."
}

Passe la main à l'accueil (halt_reason) quand:
- douleur / gonflement / saignement / question médicale → medical
- le patient demande une personne → patient_requests_human
- colère ou réclamation → angry_or_complaint
- un prix exigé est absent des tarifs → missing_price
Dans ces cas, écris quand même un message court qui annonce que l'accueil prend le relais.

Connaissance clinique:
À propos: ${k?.aboutText ?? ""}
Ton: ${k?.tone ?? "professionnel, chaleureux"}
Tarifs (rien en dehors de ce texte): ${k?.pricingNotes ?? ""}
FAQ: ${k?.faqs ?? ""}
Politiques: ${k?.policies ?? ""}
Règles de RDV: ${k?.bookingRules ?? ""}
Ne pas dire: ${k?.doNotSay ?? ""}

Traitements proposés:
${treatments || "(aucun)"}

Créneaux libres (heure du Maroc):
${slotLines || "(aucun créneau)"}
Contexte de la demande: ${slotSelection.requestContext}

${lastAiReply ? `Ton dernier message envoyé (à ne pas répéter): ${lastAiReply}` : "Aucun message envoyé pour l'instant."}

Réponds UNIQUEMENT en JSON:
{
  "language": "fr" | "darija",
  "classification": "greeting|treatment|price|booking|reschedule|cancel|human|medical|spam|admin|other",
  "halt_reason": null | "patient_requests_human|medical|missing_price|angry_or_complaint",
  "qualification": {
    "treatment_label": string|null,
    "matched_treatment_name": string|null,
    "intent": "unknown|information|book|admin",
    "can_attend": "unknown|yes|no",
    "notes": string,
    "disqualify_reason": null|string
  },
  "reply": "texte WhatsApp",
  "book_slot_start_iso": string|null,
  "reschedule_slot_start_iso": string|null
}`;

  const userContent = history.join("\n") || "Nouveau message.";

  const parsed = await callModel(system, userContent);
  if (!parsed) {
    if (await aiTurnStillAllowed(conversationId)) {
      await halt(conversationId, "ai_provider_error");
    }
    return;
  }

  if (!(await aiTurnStillAllowed(conversationId))) return;

  const qualificationAfter = await updateQualification(conversation, inquiry, parsed);
  const qualified = qualificationAfter ? isQualifiedForBooking(qualificationAfter) : false;

  if (conversation.contact.language === "unknown") {
    await prisma.contact.update({
      where: { id: conversation.contactId },
      data: { language: language === "darija" ? "ar" : "fr" },
    });
  }

  const haltReason =
    parsed.halt_reason && parsed.halt_reason !== "none" ? (parsed.halt_reason as AiHaltReason) : null;

  const reply = await bestReply({
    system,
    userContent,
    parsed,
    language,
    lastAiReply,
    qualified,
    hasExistingAppointment: Boolean(existingAppointment),
    fallback: () => {
      if (haltReason) return staffHandoffReply(haltReason, language);
      if (qualificationAfter && !qualified) return qualificationQuestion(qualificationAfter, language);
      return language === "darija"
        ? "واخا، غادي نعاونك. عطيني شي تفاصيل أكثر على اللي محتاج."
        : "Bien sûr, je peux vous aider. Dites-moi précisément ce dont vous avez besoin.";
    },
  });

  if (haltReason) {
    if (!(await aiTurnStillAllowed(conversationId))) return;
    await send(conversation.clinicId, conversationId, inquiry.id, reply);
    await halt(conversationId, haltReason);
    return;
  }

  const requestedIso = parsed.reschedule_slot_start_iso || parsed.book_slot_start_iso || null;

  if (existingAppointment) {
    if (parsed.classification === "cancel") {
      if (!(await aiTurnStillAllowed(conversationId))) return;
      await send(
        conversation.clinicId,
        conversationId,
        inquiry.id,
        cancelHandoffReply(
          formatSlotLabel(existingAppointment.startAt, existingAppointment.endAt),
          language,
        ),
      );
      await halt(conversationId, "low_confidence");
      return;
    }

    if (requestedIso) {
      const slot = slots.find((s) => s.startAt.toISOString() === requestedIso);
      if (!slot) {
        await offerAlternatives(conversation.clinicId, conversationId, inquiry.id, latestPatientText, language);
        return;
      }
      if (!(await aiTurnStillAllowed(conversationId))) return;
      try {
        // rescheduleAppointment sends the confirmation itself.
        await rescheduleAppointment({
          clinicId: conversation.clinicId,
          appointmentId: existingAppointment.id,
          startAt: slot.startAt,
          endAt: slot.endAt,
          userId: null,
          byAi: true,
        });
        return;
      } catch {
        await offerAlternatives(conversation.clinicId, conversationId, inquiry.id, latestPatientText, language);
        return;
      }
    }

    if (!(await aiTurnStillAllowed(conversationId))) return;
    await send(conversation.clinicId, conversationId, inquiry.id, reply);
    return;
  }

  if (parsed.book_slot_start_iso) {
    if (!qualified) {
      if (!(await aiTurnStillAllowed(conversationId))) return;
      await send(
        conversation.clinicId,
        conversationId,
        inquiry.id,
        qualificationAfter ? qualificationQuestion(qualificationAfter, language) : reply,
      );
      return;
    }
    const slot = slots.find((s) => s.startAt.toISOString() === parsed.book_slot_start_iso);
    if (!slot) {
      await offerAlternatives(conversation.clinicId, conversationId, inquiry.id, latestPatientText, language);
      return;
    }
    if (!(await aiTurnStillAllowed(conversationId))) return;
    try {
      await bookAppointment({
        clinicId: conversation.clinicId,
        inquiryId: inquiry.id,
        startAt: slot.startAt,
        endAt: slot.endAt,
        userId: null,
        byAi: true,
      });
      return;
    } catch {
      await offerAlternatives(conversation.clinicId, conversationId, inquiry.id, latestPatientText, language);
      return;
    }
  }

  if (!(await aiTurnStillAllowed(conversationId))) return;
  await send(conversation.clinicId, conversationId, inquiry.id, reply);
}

async function send(
  clinicId: string,
  conversationId: string,
  inquiryId: string,
  body: string,
) {
  const text = body.trim();
  if (!text) return;
  await enqueueOutbound({
    clinicId,
    conversationId,
    inquiryId,
    senderType: "ai",
    body: text,
  });
}

async function offerAlternatives(
  clinicId: string,
  conversationId: string,
  inquiryId: string,
  latestPatientText: string,
  language: Language,
) {
  if (!(await aiTurnStillAllowed(conversationId))) return;
  const retry = selectSlotsForAi(
    await listFreeSlots(clinicId, new Date(), false, 1000),
    latestPatientText,
  ).slots;
  const offer = retry
    .slice(0, 3)
    .map((s) => formatSlotLabel(s.startAt, s.endAt))
    .join(" ; ");
  await send(clinicId, conversationId, inquiryId, slotTakenReply(offer, language));
  await halt(conversationId, "booking_conflict");
}

async function callModel(
  system: string,
  userContent: string,
  correction?: string,
): Promise<AiParsed | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
      const res = await client().chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
          ...(correction ? [{ role: "user" as const, content: correction }] : []),
        ],
      });
      return AiJson.parse(JSON.parse(res.choices[0]?.message?.content ?? "{}"));
    } catch (err) {
      if (attempt === 1) console.error("ai_provider_error", err);
    }
  }
  return null;
}

/**
 * Prefer the model's own wording; only fall back to a fixed sentence when even
 * the corrected reply breaks policy. This keeps the conversation natural.
 */
async function bestReply(args: {
  system: string;
  userContent: string;
  parsed: AiParsed;
  language: Language;
  lastAiReply: string | null;
  qualified: boolean;
  hasExistingAppointment: boolean;
  fallback: () => string;
}): Promise<string> {
  const check = (reply: string) =>
    replyViolations({
      reply,
      expectedLanguage: args.language,
      lastAiReply: args.lastAiReply,
      qualified: args.qualified,
      hasExistingAppointment: args.hasExistingAppointment,
    });

  const first = args.parsed.reply.trim();
  const firstProblems = check(first);
  if (firstProblems.length === 0) return first;

  const correction = `Ta réponse précédente est refusée : "${first}".
Corrige ces points et renvoie le même JSON avec un "reply" conforme :
- ${firstProblems.join("\n- ")}`;

  const repaired = await callModel(args.system, args.userContent, correction);
  const second = repaired?.reply.trim() ?? "";
  if (second && check(second).length === 0) return second;

  return args.fallback();
}

async function updateQualification(
  conversation: {
    clinicId: string;
    clinic: { treatments: { id: string; name: string; offered: boolean }[] };
  },
  inquiry: { id: string; qualification: QualificationInput | null },
  parsed: AiParsed,
): Promise<QualificationInput | null> {
  if (!inquiry.qualification) return null;
  if (inquiry.qualification.lockedByStaff) return inquiry.qualification;
  if (!parsed.qualification) return inquiry.qualification;

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
        parsed.qualification.treatment_label ?? treatment?.name ?? current.treatmentLabel,
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
  return next;
}
