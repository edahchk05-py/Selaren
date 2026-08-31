/**
 * Normalize Moroccan (and E.164) phone numbers.
 * 0XXXXXXXXX → +212XXXXXXXXX
 */
export function normalizePhoneE164(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;

  if (digits.startsWith("+")) {
    const rest = digits.slice(1).replace(/\D/g, "");
    if (rest.length < 8 || rest.length > 15) return null;
    return `+${rest}`;
  }

  const only = digits.replace(/\D/g, "");

  if (only.startsWith("212") && only.length === 12) {
    return `+${only}`;
  }

  if (only.startsWith("0") && only.length === 10) {
    return `+212${only.slice(1)}`;
  }

  if (only.length === 9 && /^[5-7]/.test(only)) {
    return `+212${only}`;
  }

  if (only.length >= 8 && only.length <= 15) {
    return `+${only}`;
  }

  return null;
}

export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

export function firstNameFrom(name: string | null | undefined): string {
  if (!name?.trim()) return "";
  return name.trim().split(/\s+/)[0] ?? "";
}
