/**
 * Shared utilities for the document email compose flow.
 * Used by both the modal (client) and server validation.
 */

/** Parse a comma/semicolon-separated address string into trimmed, non-empty parts. */
export function parseAddresses(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Basic RFC-5322-ish email validation. */
export function isValidEmail(addr: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr.trim());
}

/** Validate every address in a list. Returns the first invalid address, or null. */
export function firstInvalidAddress(addrs: string[]): string | null {
  for (const a of addrs) {
    if (!isValidEmail(a)) return a;
  }
  return null;
}

/** Deduplicate addresses case-insensitively, preserving first-seen order. */
export function dedupeAddresses(addrs: string[]): string[] {
  const seen = new Set<string>();
  return addrs.filter((a) => {
    const key = a.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Remove any address from `list` that already appears in `others` (case-insensitive). */
export function removeOverlap(list: string[], others: string[]): string[] {
  const otherSet = new Set(others.map((a) => a.toLowerCase()));
  return list.filter((a) => !otherSet.has(a.toLowerCase()));
}

export const SYSTEM_FOOTER = 'This email was sent automatically from IWIllBUILD. Please do not reply.';
export const MAX_SUBJECT_LEN = 200;
export const MAX_MESSAGE_LEN = 4000;
