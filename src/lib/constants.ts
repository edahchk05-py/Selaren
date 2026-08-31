export const TIMEZONE = "Africa/Casablanca";
export const COUNTRY_CODE = "MA";
export const LOCALE = "fr";

export const SLOT_MINUTES_DEFAULT = 30;
export const SLOT_MINUTES_MIN = 15;
export const SLOT_MINUTES_MAX = 60;
export const SLOT_LEAD_MINUTES = 15;
export const SLOT_WINDOW_DAYS = 14;
export const SLOT_OFFER_LIMIT = 12;

export const FOLLOW_UP_STEPS_MS = [
  2 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  72 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
] as const;

export const QUIET_HOUR_START = 21;
export const QUIET_HOUR_END = 9;

export const CUSTOMER_CARE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Release a claimed outbox/follow-up/reminder row if the worker died mid-send. */
export const CLAIM_STALE_MS = 2 * 60 * 1000;
/** Graph was invoked; delivery is unknown if the process died before a Meta response was recorded. */
export const SEND_OUTCOME_UNKNOWN = "send_outcome_unknown";
export const OUTCOME_PENDING_AFTER_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_FOLLOW_UP_TEXT =
  "Bonjour, nous revenons vers vous concernant votre demande. Souhaitez-vous réserver une consultation à la clinique ?";

export const DEFAULT_MISSED_CALL_TEXT =
  "Bonjour, nous avons manqué votre appel à la clinique. Comment pouvons-nous vous aider ? Vous pouvez répondre ici pour une question ou pour réserver une consultation.";

export const REQUIRED_TEMPLATES = [
  "missed_call_recovery",
  "follow_up_nudge",
  "appointment_confirmation",
  "appointment_reminder",
  "appointment_cancelled",
] as const;

export const AI_HALT_REASONS = [
  "patient_requests_human",
  "medical",
  "missing_price",
  "outside_window",
  "booking_conflict",
  "angry_or_complaint",
  "low_confidence",
  "ai_provider_error",
  "media_only",
  "follow_up_exhausted",
] as const;

export type AiHaltReason = (typeof AI_HALT_REASONS)[number];
