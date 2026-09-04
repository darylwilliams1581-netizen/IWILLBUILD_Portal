/**
 * Session Timeout — Shared Expiry Calculation
 *
 * Rules:
 *   1. Hard max: 30 days from sign-in.
 *   2. No daily cutoff — sessions persist across days until the hard max.
 *
 * Storage key used in localStorage:
 *   "iwb_session_expires_at" — Unix timestamp (ms) of the effective expiry.
 */

export const SESSION_STORAGE_KEY = 'iwb_session_expires_at';

/** Hard maximum session lifetime: 30 days in ms. */
export const SESSION_MAX_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Calculate the effective session expiry timestamp (ms since epoch) for a
 * session that started at `signInMs` (defaults to now).
 *
 * Returns signInMs + 30 days.
 */
export function calcSessionExpiry(signInMs: number = Date.now()): number {
  return signInMs + SESSION_MAX_MS;
}

/**
 * Returns true if the given expiry timestamp (ms) is in the past.
 */
export function isSessionExpired(expiresAtMs: number): boolean {
  return Date.now() >= expiresAtMs;
}

/**
 * Returns milliseconds until the session expires (negative if already expired).
 */
export function msUntilExpiry(expiresAtMs: number): number {
  return expiresAtMs - Date.now();
}

// ── localStorage helpers (client-only) ────────────────────────────────────────

/**
 * Stamp the session expiry into localStorage. Call this immediately after a
 * successful sign-in.
 */
export function stampSessionExpiry(signInMs: number = Date.now()): number {
  const expiresAt = calcSessionExpiry(signInMs);
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, String(expiresAt));
  } catch {
    // Private browsing / storage quota — best-effort
  }
  return expiresAt;
}

/**
 * Read the stored session expiry from localStorage.
 * Returns null if not set or unparseable.
 */
export function readSessionExpiry(): number | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Clear the stored session expiry from localStorage.
 */
export function clearSessionExpiry(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // best-effort
  }
}
