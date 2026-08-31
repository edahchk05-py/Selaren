export type QualificationInput = {
  status: "unevaluated" | "in_progress" | "qualified" | "disqualified";
  treatmentId: string | null;
  treatmentLabel: string | null;
  intent: "unknown" | "information" | "book" | "admin";
  canAttendClinic: "unknown" | "yes" | "no";
  disqualifyReason:
    | "no_intent"
    | "cannot_attend"
    | "treatment_not_offered"
    | "spam"
    | "wrong_number"
    | "existing_admin_only"
    | "other"
    | null;
  notes: string;
  lockedByStaff: boolean;
};

const GENERIC_SPAM = /^(hi+|hello+|test|asdf|spam|\.+|👍+)$/i;

export function hasTreatmentInterest(q: Pick<QualificationInput, "treatmentId" | "treatmentLabel">): boolean {
  if (q.treatmentId) return true;
  const label = q.treatmentLabel?.trim() ?? "";
  if (!label) return false;
  if (GENERIC_SPAM.test(label)) return false;
  return true;
}

export function computeQualificationStatus(q: QualificationInput): QualificationInput["status"] {
  if (q.disqualifyReason) return "disqualified";

  const treatmentOk = hasTreatmentInterest(q);
  const intentBook = q.intent === "book";
  const canAttend = q.canAttendClinic === "yes";

  if (treatmentOk && intentBook && canAttend) return "qualified";

  const anySignal =
    treatmentOk ||
    q.intent !== "unknown" ||
    q.canAttendClinic !== "unknown" ||
    (q.notes?.trim().length ?? 0) > 0;

  if (anySignal) return "in_progress";
  return "unevaluated";
}

export function shouldAutoClose(reason: QualificationInput["disqualifyReason"]): boolean {
  return reason === "spam" || reason === "wrong_number";
}

export function applyQualificationPatch(
  current: QualificationInput,
  patch: Partial<QualificationInput>,
  opts: { byStaff: boolean },
): QualificationInput {
  if (current.lockedByStaff && !opts.byStaff) {
    return current;
  }
  const next: QualificationInput = {
    ...current,
    ...patch,
    lockedByStaff: opts.byStaff ? (patch.lockedByStaff ?? true) : current.lockedByStaff,
  };
  if (opts.byStaff && patch.lockedByStaff === undefined) {
    next.lockedByStaff = true;
  }
  next.status = computeQualificationStatus(next);
  return next;
}

export function assumeCanAttendIfMessagingLocalClinic(
  canAttend: QualificationInput["canAttendClinic"],
): QualificationInput["canAttendClinic"] {
  return canAttend === "unknown" ? "yes" : canAttend;
}
