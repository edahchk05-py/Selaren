import { formatInTimeZone } from "date-fns-tz";
import type { FreeSlot } from "./slots";
import { TIMEZONE, type AiHaltReason } from "./constants";
import { hasTreatmentInterest, type QualificationInput } from "./qualification";

export type Language = "fr" | "darija";
type Period = "morning" | "afternoon" | "evening";

/**
 * Halts a new patient message should clear on its own. Leaving these sticky
 * silences the number forever: one provider hiccup or one voice note used to
 * end every future conversation with that patient.
 */
const RECOVERABLE_HALTS: AiHaltReason[] = [
  "outside_window",
  "booking_conflict",
  "ai_provider_error",
  "media_only",
  "follow_up_exhausted",
  "low_confidence",
];

/** Halts that stay until staff reply: the patient already got a handoff notice. */
const STAFF_REQUIRED_HALTS: AiHaltReason[] = [
  "patient_requests_human",
  "medical",
  "missing_price",
  "angry_or_complaint",
];

export function isRecoverableHalt(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return RECOVERABLE_HALTS.includes(reason as AiHaltReason);
}

export function requiresStaff(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return STAFF_REQUIRED_HALTS.includes(reason as AiHaltReason);
}

const DAY_TERMS: { weekday: number; label: string; terms: string[] }[] = [
  { weekday: 0, label: "lundi", terms: ["lundi", "tnin", "الاثنين", "الإثنين"] },
  { weekday: 1, label: "mardi", terms: ["mardi", "tlata", "الثلاثاء"] },
  { weekday: 2, label: "mercredi", terms: ["mercredi", "larbaa", "الأربعاء", "الاربعاء"] },
  { weekday: 3, label: "jeudi", terms: ["jeudi", "khmis", "الخميس"] },
  { weekday: 4, label: "vendredi", terms: ["vendredi", "jemaa", "الجمعة"] },
  { weekday: 5, label: "samedi", terms: ["samedi", "sebt", "السبت"] },
  { weekday: 6, label: "dimanche", terms: ["dimanche", "lhed", "الأحد", "الاحد"] },
];

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

const ARABIC_SCRIPT = /[\u0600-\u06FF]/;

/** The patient's script decides the reply language; the model only confirms it. */
export function detectLanguage(text: string, fallback: Language = "fr"): Language {
  if (ARABIC_SCRIPT.test(text)) return "darija";
  const latin = normalize(text);
  const darijaWords =
    /\b(salam|salamo|labas|bghit|bghyt|wach|wash|chhal|shhal|kifash|3afak|afak|mzyan|smhli|daba|ghda|imta|fin|3andi|andi)\b/;
  if (darijaWords.test(latin)) return "darija";
  return fallback;
}

function slotWeekday(slot: FreeSlot): number {
  return Number(formatInTimeZone(slot.startAt, TIMEZONE, "i")) - 1;
}

function slotHour(slot: FreeSlot): number {
  return Number(formatInTimeZone(slot.startAt, TIMEZONE, "H"));
}

function detectPeriod(text: string): Period | null {
  if (/(matin|sbah|صباح)/i.test(text)) return "morning";
  if (/(apres[- ]?midi|العشية|بعد الظهر)/i.test(text)) return "afternoon";
  if (/(soir|lil|مساء|ليل)/i.test(text)) return "evening";
  return null;
}

function inPeriod(slot: FreeSlot, period: Period): boolean {
  const hour = slotHour(slot);
  if (period === "morning") return hour < 12;
  if (period === "afternoon") return hour >= 12 && hour < 18;
  return hour >= 18;
}

function diverseSlots(slots: FreeSlot[], limit: number): FreeSlot[] {
  const groups = new Map<string, FreeSlot[]>();
  for (const slot of slots) {
    const day = formatInTimeZone(slot.startAt, TIMEZONE, "yyyy-MM-dd");
    groups.set(day, [...(groups.get(day) ?? []), slot]);
  }
  const days = [...groups.values()];
  const selected: FreeSlot[] = [];
  for (let index = 0; selected.length < limit; index++) {
    let added = false;
    for (const day of days) {
      const slot = day[index];
      if (!slot) continue;
      selected.push(slot);
      added = true;
      if (selected.length >= limit) break;
    }
    if (!added) break;
  }
  return selected.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

export function selectSlotsForAi(
  allSlots: FreeSlot[],
  latestPatientText: string,
  limit = 12,
): { slots: FreeSlot[]; requestContext: string } {
  const text = normalize(latestPatientText);
  const requestedDay = DAY_TERMS.find((day) => day.terms.some((term) => text.includes(normalize(term))));
  const requestedPeriod = detectPeriod(text);
  const hourMatch = text.match(/(?:^|\s)([01]?\d|2[0-3])\s*(?:h|:)\s*(\d{0,2})(?:\s|$)/);
  const requestedHour = hourMatch ? Number(hourMatch[1]) : null;

  let candidates = allSlots;
  if (requestedDay) {
    candidates = candidates.filter((slot) => slotWeekday(slot) === requestedDay.weekday);
  }
  const dayCandidates = candidates;
  if (requestedPeriod) {
    candidates = candidates.filter((slot) => inPeriod(slot, requestedPeriod));
  }
  if (requestedHour !== null) {
    candidates = candidates.filter((slot) => slotHour(slot) === requestedHour);
  }

  const exactMatch = candidates.length > 0;
  if (!exactMatch && requestedDay && dayCandidates.length > 0) {
    candidates = dayCandidates;
  } else if (!exactMatch) {
    candidates = allSlots;
  }

  const requested = [
    requestedDay?.label,
    requestedPeriod === "morning"
      ? "matin"
      : requestedPeriod === "afternoon"
        ? "après-midi"
        : requestedPeriod === "evening"
          ? "soir"
          : null,
    requestedHour !== null ? `${requestedHour}h` : null,
  ].filter(Boolean);

  const requestContext =
    requested.length === 0
      ? "Aucune période précise demandée. Présente des choix sur plusieurs jours."
      : exactMatch
        ? `Demande temporelle détectée : ${requested.join(" ")}. Les créneaux listés correspondent à cette demande.`
        : `Demande temporelle détectée : ${requested.join(" ")}. Aucun créneau ne correspond exactement ; dis-le clairement et propose seulement les alternatives listées.`;

  return {
    slots: requested.length > 0 ? candidates.slice(0, limit) : diverseSlots(candidates, limit),
    requestContext,
  };
}

export function isQualifiedForBooking(
  qualification: Pick<
    QualificationInput,
    "treatmentId" | "treatmentLabel" | "intent" | "canAttendClinic" | "disqualifyReason"
  >,
): boolean {
  return (
    !qualification.disqualifyReason &&
    hasTreatmentInterest(qualification) &&
    qualification.intent === "book" &&
    qualification.canAttendClinic === "yes"
  );
}

/** What the reply still has to establish before any slot may be offered. */
export function missingQualification(
  qualification: Pick<QualificationInput, "treatmentId" | "treatmentLabel" | "intent" | "canAttendClinic">,
): "treatment" | "intent" | "attendance" | null {
  if (!hasTreatmentInterest(qualification)) return "treatment";
  if (qualification.intent !== "book") return "intent";
  if (qualification.canAttendClinic !== "yes") return "attendance";
  return null;
}

export function replyOffersAppointmentSlots(reply: string): boolean {
  const normalized = normalize(reply);
  const timePattern = /\b(?:[01]?\d|2[0-3])\s*(?:h|:)\s*\d{0,2}\b/g;
  const times = normalized.match(timePattern) ?? [];
  if (times.length >= 2) return true;
  return (
    times.length === 1 &&
    /(creneau|disponib|rendez-vous|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/.test(
      normalized,
    )
  );
}

function similarity(a: string, b: string): number {
  const left = new Set(normalize(a).split(/\s+/).filter(Boolean));
  const right = new Set(normalize(b).split(/\s+/).filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return shared / Math.max(left.size, right.size);
}

export type ReplyContext = {
  reply: string;
  expectedLanguage: Language;
  lastAiReply: string | null;
  qualified: boolean;
  hasExistingAppointment: boolean;
};

/**
 * Text is generated by the model, then checked here. Violations become a
 * correction instruction for one repair attempt, which keeps replies natural
 * instead of substituting canned sentences on every turn.
 */
export function replyViolations(ctx: ReplyContext): string[] {
  const problems: string[] = [];
  const reply = ctx.reply.trim();

  if (!reply) {
    problems.push("La réponse est vide : écris un message WhatsApp utile.");
    return problems;
  }

  const hasArabic = ARABIC_SCRIPT.test(reply);
  if (ctx.expectedLanguage === "darija" && !hasArabic) {
    problems.push(
      "Le patient écrit en darija : réponds en darija marocaine avec l'alphabet arabe, sans passer au français.",
    );
  }
  if (ctx.expectedLanguage === "fr" && hasArabic) {
    problems.push("Le patient écrit en français : réponds uniquement en français.");
  }
  if (/\b(je suis une (ia|intelligence)|assistant virtuel|en tant qu'ia|selaren)\b/i.test(reply)) {
    problems.push("Ne te présente jamais comme une IA et ne mentionne jamais Selaren.");
  }
  if (!ctx.qualified && replyOffersAppointmentSlots(reply)) {
    problems.push(
      "Tu proposes des horaires alors que la qualification n'est pas complète : pose d'abord UNE question précise, sans citer d'horaire.",
    );
  }
  if (ctx.hasExistingAppointment && /\b(nouveau rendez-vous|deuxi[eè]me rendez-vous)\b/i.test(reply)) {
    problems.push(
      "Le patient a déjà un rendez-vous : parle de modification de ce rendez-vous, jamais d'un second.",
    );
  }
  if (ctx.lastAiReply && similarity(reply, ctx.lastAiReply) > 0.8) {
    problems.push(
      "Cette réponse répète ton message précédent : reformule et fais avancer la conversation.",
    );
  }
  if (reply.length > 700) {
    problems.push("Réponse trop longue pour WhatsApp : maximum 3 phrases courtes.");
  }
  return problems;
}

export function qualificationQuestion(
  qualification: Pick<QualificationInput, "treatmentId" | "treatmentLabel" | "intent" | "canAttendClinic">,
  language: Language,
): string {
  const missing = missingQualification(qualification);
  if (missing === "treatment") {
    return language === "darija"
      ? "باش نلقاو ليك الموعد المناسب، شنو هو العلاج اللي مهتم بيه؟"
      : "Pour vous proposer le bon rendez-vous, quel traitement vous intéresse ?";
  }
  if (missing === "intent") {
    return language === "darija"
      ? "واش بغيتي نحجزو ليك موعد للاستشارة؟"
      : "Souhaitez-vous réserver une consultation ?";
  }
  return language === "darija"
    ? "واش تقدر تجي للعيادة للاستشارة؟"
    : "Pouvez-vous vous présenter à la clinique pour la consultation ?";
}

export function staffHandoffReply(reason: AiHaltReason, language: Language): string {
  if (reason === "medical") {
    return language === "darija"
      ? "أنا ما نقدرش نعطيك جواب طبي. عيط للعيادة دابا، أو الاستقبال غادي يتواصل معاك."
      : "Je ne peux pas donner d’avis médical. Appelez la clinique dès maintenant, l’accueil vous répondra.";
  }
  if (reason === "missing_price") {
    return language === "darija"
      ? "هاد الثمن خاص الاستقبال يأكدو ليك. غادي يجاوبوك من هنا بالضبط."
      : "Ce tarif doit être confirmé par l’accueil. Ils vous répondent ici avec le montant exact.";
  }
  if (reason === "angry_or_complaint") {
    return language === "darija"
      ? "سمح لينا على هاد المشكل. الاستقبال غادي يتكلف بالموضوع ديالك شخصيا."
      : "Nous sommes désolés pour cette situation. L’accueil reprend votre dossier personnellement.";
  }
  return language === "darija"
    ? "واخا، غادي نوصل الرسالة ديالك للاستقبال وغادي يجاوبك."
    : "Bien sûr, je transmets votre message à l’accueil qui va vous répondre.";
}

export function existingAppointmentReply(appointmentLabel: string, language: Language): string {
  return language === "darija"
    ? `عندك ديجا موعد ${appointmentLabel}. باش نبدلوه أو نلغيوه، الاستقبال غادي يتكلف بيك.`
    : `Vous avez déjà un rendez-vous ${appointmentLabel}. L’accueil va vous aider à le modifier ou à l’annuler.`;
}

export function cancelHandoffReply(appointmentLabel: string, language: Language): string {
  return language === "darija"
    ? `فهمت، بخصوص الموعد ${appointmentLabel}. الاستقبال غادي يأكد ليك الإلغاء من هنا.`
    : `J’ai bien noté, pour le rendez-vous ${appointmentLabel}. L’accueil vous confirme l’annulation ici.`;
}

export function slotTakenReply(offer: string, language: Language): string {
  if (!offer) {
    return language === "darija"
      ? "هاد الوقت تحجز قبل منا. الاستقبال غادي يقترح عليك وقت آخر."
      : "Ce créneau vient d’être pris. L’accueil va vous proposer un autre horaire.";
  }
  return language === "darija"
    ? `هاد الوقت تحجز قبل منا. واش يناسبك واحد من هادو: ${offer}؟`
    : `Ce créneau vient d’être pris. Souhaitez-vous l’un de ces horaires : ${offer} ?`;
}

export function mediaHandoffReply(
  mediaType: string | null | undefined,
  language: Language,
): string {
  if (language === "darija") {
    return mediaType === "audio"
      ? "توصلنا بالرسالة الصوتية ديالك. الاستقبال غادي يسمعها ويجاوبك."
      : "توصلنا بالملف ديالك. الاستقبال غادي يشوفو ويجاوبك.";
  }
  return mediaType === "audio"
    ? "Nous avons bien reçu votre message vocal. L’accueil va l’écouter et vous répondre."
    : "Nous avons bien reçu votre fichier. L’accueil va le consulter et vous répondre.";
}
