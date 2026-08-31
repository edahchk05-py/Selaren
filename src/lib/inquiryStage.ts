export type InboxLabel =
  | "New"
  | "Waiting on patient"
  | "Waiting on clinic"
  | "Qualifying"
  | "Qualified"
  | "Follow-up"
  | "Booked"
  | "Deposit pending"
  | "Deposited"
  | "Outcome pending"
  | "No-show"
  | "Showed"
  | "Closed"
  | "Needs staff";

export type StageInput = {
  inquiryStatus: "open" | "booked" | "closed";
  firstResponseAt: Date | null;
  lastMessageDirection: "inbound" | "outbound" | null;
  conversationMode: "ai" | "human";
  aiHaltReason: string | null;
  qualificationStatus: "unevaluated" | "in_progress" | "qualified" | "disqualified";
  hasScheduledAppointment: boolean;
  depositStatus: "none" | "deposited" | null;
  depositTypicallyRequired: boolean;
  attendance: "pending" | "showed" | "no_show" | null;
  appointmentStartAt: Date | null;
  followUpScheduledOrSent: boolean;
  followUpExhausted: boolean;
  now: Date;
};

export function deriveInboxLabels(s: StageInput): InboxLabel[] {
  const labels: InboxLabel[] = [];
  const needsStaff =
    Boolean(s.aiHaltReason) ||
    s.conversationMode === "human" ||
    s.followUpExhausted;
  if (needsStaff) labels.push("Needs staff");

  if (s.inquiryStatus === "closed") {
    labels.push("Closed");
    return labels;
  }

  if (s.inquiryStatus === "open" && !s.firstResponseAt) labels.push("New");

  if (
    s.inquiryStatus === "open" &&
    s.firstResponseAt &&
    s.lastMessageDirection === "outbound"
  ) {
    labels.push("Waiting on patient");
  }

  if (
    (s.inquiryStatus === "open" || s.inquiryStatus === "booked") &&
    (s.lastMessageDirection === "inbound" || s.conversationMode === "human")
  ) {
    labels.push("Waiting on clinic");
  }

  if (s.inquiryStatus === "open" && s.qualificationStatus === "in_progress") {
    labels.push("Qualifying");
  }

  if (
    s.inquiryStatus === "open" &&
    s.qualificationStatus === "qualified" &&
    !s.hasScheduledAppointment
  ) {
    labels.push("Qualified");
  }

  if (s.inquiryStatus === "open" && s.followUpScheduledOrSent && !s.hasScheduledAppointment) {
    labels.push("Follow-up");
  }

  if (s.inquiryStatus === "booked") labels.push("Booked");

  if (
    s.inquiryStatus === "booked" &&
    s.depositStatus === "none" &&
    s.depositTypicallyRequired
  ) {
    labels.push("Deposit pending");
  }

  if (s.inquiryStatus === "booked" && s.depositStatus === "deposited") {
    labels.push("Deposited");
  }

  if (
    s.hasScheduledAppointment &&
    s.attendance === "pending" &&
    s.appointmentStartAt &&
    s.now.getTime() >= s.appointmentStartAt.getTime() + 24 * 60 * 60 * 1000
  ) {
    labels.push("Outcome pending");
  }

  if (s.attendance === "no_show") labels.push("No-show");
  if (s.attendance === "showed") labels.push("Showed");

  return labels;
}

export function inboxSortKey(labels: InboxLabel[], lastPatientAt: Date | null): [number, number] {
  const priority =
    labels.includes("Needs staff") || labels.includes("Waiting on clinic") ? 0 : 1;
  const t = lastPatientAt ? -lastPatientAt.getTime() : 0;
  return [priority, t];
}
