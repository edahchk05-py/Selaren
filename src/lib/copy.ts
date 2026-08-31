import type { InboxLabel } from "./inquiryStage";
import type { ActivationState } from "./activation";

export const PRODUCT_LINE = "Chaque demande devient un rendez-vous.";

export function cityLabel(city: string | null | undefined): string {
  if (city === "casablanca") return "Casablanca";
  if (city === "marrakech") return "Marrakech";
  return city ?? "—";
}

export function clinicStatusLabel(status: string | null | undefined): string {
  if (status === "active") return "Active";
  if (status === "paused") return "En pause";
  if (status === "onboarding") return "Configuration en cours";
  return "—";
}

export function roleLabel(role: string | null | undefined, isOperator: boolean): string {
  if (isOperator) return "Équipe Selaren";
  if (role === "owner") return "Propriétaire";
  if (role === "staff") return "Accueil";
  return "Équipe";
}

export function inboxLabelFr(label: InboxLabel): string {
  const map: Record<InboxLabel, string> = {
    New: "Nouveau",
    "Waiting on patient": "En attente du patient",
    "Waiting on clinic": "À traiter",
    Qualifying: "En qualification",
    Qualified: "Qualifié",
    "Follow-up": "Relance",
    Booked: "Réservé",
    "Deposit pending": "Acompte à noter",
    Deposited: "Acompte noté",
    "Outcome pending": "Présence à confirmer",
    "No-show": "Absent",
    Showed: "Venu",
    Closed: "Clôturé",
    "Needs staff": "À reprendre",
  };
  return map[label] ?? label;
}

/** One headline state for a conversation card. */
export function primaryInboxLabel(labels: InboxLabel[]): InboxLabel {
  const order: InboxLabel[] = [
    "Needs staff",
    "New",
    "Waiting on clinic",
    "Qualifying",
    "Qualified",
    "Waiting on patient",
    "Follow-up",
    "Booked",
    "Deposit pending",
    "Deposited",
    "Outcome pending",
    "No-show",
    "Showed",
    "Closed",
  ];
  return order.find((l) => labels.includes(l)) ?? labels[0] ?? "New";
}

export function handlerLabel(mode: "ai" | "human"): string {
  return mode === "human" ? "Accueil" : "IA assistée";
}

export function haltReasonFr(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const map: Record<string, string> = {
    patient_requests_human: "Le patient a demandé à parler à l’accueil.",
    medical: "Question médicale : l’accueil doit répondre.",
    missing_price: "Ce tarif n’est pas dans la fiche clinique. L’accueil doit répondre.",
    outside_window: "La fenêtre WhatsApp est fermée. L’accueil doit reprendre.",
    booking_conflict: "Le créneau n’est plus disponible.",
    angry_or_complaint: "Réclamation : l’accueil doit reprendre.",
    low_confidence: "L’assistance automatique n’est pas assez sûre. L’accueil doit reprendre.",
    ai_provider_error:
      "L’assistance automatique est temporairement indisponible. L’équipe peut répondre manuellement.",
    media_only: "Le patient a envoyé un média. L’accueil doit le lire.",
    follow_up_exhausted: "Les relances automatiques sont épuisées. L’accueil doit reprendre.",
  };
  return map[reason] ?? "L’accueil doit reprendre cette conversation.";
}

export function qualificationStatusFr(status: string | null | undefined): string {
  if (status === "qualified") return "Qualifiée";
  if (status === "in_progress") return "En cours";
  if (status === "disqualified") return "Non retenue";
  return "Pas encore évaluée";
}

export function sourceLabel(source: string | null | undefined): string {
  if (source === "whatsapp") return "WhatsApp";
  if (source === "missed_call") return "Appel manqué";
  if (source === "manual") return "Saisie accueil";
  return source ?? "";
}

export function treatmentCategoryFr(cat: string): string {
  const map: Record<string, string> = {
    implant: "Implant",
    veneer: "Facettes",
    aligner: "Aligneurs",
    orthodontics: "Orthodontie",
    aesthetic: "Esthétique",
    other: "Autre",
  };
  return map[cat] ?? cat;
}

export function attendanceFr(v: string | null | undefined): string {
  if (v === "showed") return "Venu";
  if (v === "no_show") return "Absent";
  return "Présence à noter";
}

export function depositFr(v: string | null | undefined): string {
  if (v === "deposited") return "Acompte noté";
  return "Sans acompte";
}

export function apptStatusFr(v: string | null | undefined): string {
  if (v === "scheduled") return "Confirmé";
  if (v === "cancelled") return "Annulé";
  if (v === "rescheduled") return "Reprogrammé";
  return v ?? "";
}

export function bookingErrorFr(code: string | undefined): string | null {
  if (code === "slot") return "Ce créneau n’est plus disponible. Choisissez un autre horaire.";
  if (code === "book") return "La réservation n’a pas pu aboutir. Réessayez ou choisissez un autre créneau.";
  return null;
}

export function senderFr(type: string): string {
  if (type === "patient") return "Patient";
  if (type === "staff") return "Accueil";
  if (type === "ai") return "IA assistée";
  if (type === "system") return "Selaren";
  return type;
}

export function messageStatusFr(status: string, error?: string | null): string | null {
  if (status === "failed") {
    if (error === "send_outcome_unknown")
      return "Envoi WhatsApp incertain : le message a peut-être déjà été livré. Ne renvoyez pas automatiquement.";
    if (error === "opt_out") return "Non envoyé : le patient a demandé à ne plus être contacté.";
    if (error === "outside_window_template_required")
      return "Non envoyé : hors fenêtre WhatsApp. Un modèle approuvé est nécessaire.";
    if (error === "whatsapp_disconnected") return "WhatsApp n’est pas connecté.";
    if (error && /template|13200|parameter/i.test(error))
      return "Modèle WhatsApp refusé. Vérifiez le nom, la langue fr et les variables dans Meta.";
    return "L’envoi a échoué. L’accueil peut réessayer.";
  }
  if (status === "queued") return "En cours d’envoi…";
  return null;
}

export type SetupItem = {
  key: string;
  label: string;
  hint: string;
  done: boolean;
};

export function setupChecklist(s: ActivationState): {
  items: SetupItem[];
  done: number;
  total: number;
  percent: number;
} {
  const items: SetupItem[] = [
    {
      key: "identity",
      label: "Identité",
      hint: "Nom et ville de la clinique",
      done: Boolean(s.name.trim() && s.city),
    },
    {
      key: "value",
      label: "Activité",
      hint: "Valeur de consultation (MAD)",
      done: Boolean(s.defaultConsultationValueMad && s.defaultConsultationValueMad > 0),
    },
    {
      key: "owner",
      label: "Propriétaire",
      hint: "Au moins un compte propriétaire",
      done: s.ownerCount >= 1,
    },
    {
      key: "treatments",
      label: "Traitements",
      hint: "Au moins un traitement proposé",
      done: s.offeredTreatmentCount >= 1,
    },
    {
      key: "knowledge",
      label: "Connaissance",
      hint: "Fiche complète pour l’assistance automatique",
      done: s.knowledgeComplete,
    },
    {
      key: "hours",
      label: "Horaires",
      hint: "Au moins un jour d’ouverture",
      done: s.enabledWeekdays >= 1,
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      hint: "Numéro de la clinique connecté",
      done: s.whatsappActive,
    },
    {
      key: "templates",
      label: "Modèles WhatsApp",
      hint: s.sessionOnlyPilot
        ? "Pilote 24 h : les relances hors fenêtre resteront à l’accueil"
        : "Modèles Meta prêts, ou pilote session uniquement",
      done: s.templatesReady || s.sessionOnlyPilot,
    },
  ];
  const done = items.filter((i) => i.done).length;
  return { items, done, total: items.length, percent: Math.round((done / items.length) * 100) };
}

export function relativeWhen(date: Date, now = new Date()): string {
  const diff = now.getTime() - date.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "À l’instant";
  if (min < 60) return `Il y a ${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `Il y a ${hrs} h`;
  const days = Math.round(hrs / 24);
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days} j`;
  return new Intl.DateTimeFormat("fr-MA", {
    timeZone: "Africa/Casablanca",
    day: "numeric",
    month: "short",
  }).format(date);
}
