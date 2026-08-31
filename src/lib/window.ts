import { CUSTOMER_CARE_WINDOW_MS } from "./constants";

export function isInsideCustomerCareWindow(
  lastPatientMessageAt: Date | null,
  now = new Date(),
): boolean {
  if (!lastPatientMessageAt) return false;
  return now.getTime() - lastPatientMessageAt.getTime() < CUSTOMER_CARE_WINDOW_MS;
}

export type SendChannel = "session" | "template";

export function requiredSendChannel(
  lastPatientMessageAt: Date | null,
  now = new Date(),
): SendChannel {
  return isInsideCustomerCareWindow(lastPatientMessageAt, now) ? "session" : "template";
}
