import { formatInTimeZone } from "date-fns-tz";
import type { FreeSlot } from "./slots";
import { TIMEZONE } from "./constants";
import { hasTreatmentInterest, type QualificationInput } from "./qualification";

type Language = "fr" | "darija";
type Period = "morning" | "afternoon" | "evening";

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

export function qualificationQuestion(
  qualification: Pick<QualificationInput, "treatmentId" | "treatmentLabel" | "intent" | "canAttendClinic">,
  language: Language,
): string {
  if (!hasTreatmentInterest(qualification)) {
    return language === "darija"
      ? "باش نعاونك نحجز الموعد المناسب، شنو هو العلاج اللي مهتم به؟"
      : "Pour vous proposer le bon rendez-vous, quel traitement vous intéresse ?";
  }
  if (qualification.intent !== "book") {
    return language === "darija"
      ? "واش بغيتي نحجزو ليك موعد للاستشارة؟"
      : "Souhaitez-vous réserver une consultation ?";
  }
  return language === "darija"
    ? "واش تقدر تجي للعيادة من أجل الاستشارة؟"
    : "Pouvez-vous vous présenter à la clinique pour la consultation ?";
}

export function existingAppointmentReply(
  appointmentLabel: string,
  language: Language,
): string {
  return language === "darija"
    ? `عندك ديجا موعد مبرمج ${appointmentLabel}. باش نبدلوه أو نلغيوه، غادي يتكلف بك الاستقبال.`
    : `Vous avez déjà un rendez-vous prévu ${appointmentLabel}. L’accueil va vous aider à le modifier ou à l’annuler.`;
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
