export type ActivationState = {
  name: string;
  city: "casablanca" | "marrakech" | null;
  defaultConsultationValueMad: number | null;
  ownerCount: number;
  offeredTreatmentCount: number;
  knowledgeComplete: boolean;
  enabledWeekdays: number;
  whatsappActive: boolean;
  templatesReady: boolean;
  sessionOnlyPilot: boolean;
};

export function knowledgeComplete(k: {
  aboutText: string;
  tone: string;
  pricingNotes: string;
  faqs: string;
  policies: string;
  bookingRules: string;
  doNotSay: string;
} | null): boolean {
  if (!k) return false;
  return [
    k.aboutText,
    k.tone,
    k.pricingNotes,
    k.faqs,
    k.policies,
    k.bookingRules,
    k.doNotSay,
  ].every((v) => v.trim().length > 0);
}

export function activationGaps(s: ActivationState): string[] {
  const gaps: string[] = [];
  if (!s.name.trim()) gaps.push("Nom de la clinique");
  if (!s.city) gaps.push("Ville");
  if (!(s.defaultConsultationValueMad && s.defaultConsultationValueMad > 0)) {
    gaps.push("Valeur de consultation par défaut");
  }
  if (s.ownerCount < 1) gaps.push("Au moins un propriétaire");
  if (s.offeredTreatmentCount < 1) gaps.push("Au moins un traitement proposé");
  if (!s.knowledgeComplete) gaps.push("Fiche connaissance complète");
  if (s.enabledWeekdays < 1) gaps.push("Au moins un jour d'ouverture");
  if (!s.whatsappActive) gaps.push("Connexion WhatsApp active");
  if (!s.templatesReady && !s.sessionOnlyPilot) {
    gaps.push("Modèles WhatsApp (ou pilote session uniquement)");
  }
  return gaps;
}

export function canActivate(s: ActivationState): boolean {
  return activationGaps(s).length === 0;
}
