/**
 * Session Timeout — Shared Expiry Calculation
 *
 * Rules (both client and server use this module):
 *   1. Hard max: 14 hours from sign-in.
 *   2. Daily cutoff: 06:00 AEST (UTC+10) — the start of the next working day.
 *   3. Effective expiry = min(signInTime + 14h, next06:00AfterSignIn).
 *
 * Why 06:00 AEST?
 *   Field workers start their day at or after 06:00. Forcing sign-out at that
 *   boundary means no session from the previous day carries into a new shift,
 *   even if the 14h window hasn't elapsed yet (e.g. someone signs in at 18:00,
 *   their 14h window would reach 08:00 the next day — the 06:00 cutoff fires
 *   first and clears the session before the new shift begins).
 *
 * Storage key used in localStorage:
 *   "iwb_session_expires_at" — Unix timestamp (ms) of the effective expiry.
 *
 * The server reads the same value from the session cookie's metadata via the
 * custom `session_expires_at` claim stamped at login time.
 */

export const SESSION_STORAGE_KEY = 'iwb_session_expires_at';

/** AEST is UTC+10. No DST in Queensland. */
const AEST_OFFSET_MS = 10 * 60 * 60 * 1000;

/** Hard maximum session lifetime: 14 hours in ms. */
export const SESSION_MAX_MS = 14 * 60 * 60 * 1000;

/** Daily cutoff hour in AEST (24h). */
const CUTOFF_HOUR_AEST = 6;

/**
 * Calculate the effective session expiry timestamp (ms since epoch) for a
 * session that started at `signInMs` (defaults to now).
 *
 * Returns the earlier of:
 *   - signInMs + 14h
 *   - The next 06:00 AEST boundary strictly after signInMs
 */
export function calcSessionExpiry(signInMs: number = Date.now()): number {
  const hardExpiry = signInMs + SESSION_MAX_MS;

  // Convert signInMs to AEST wall-clock time
  const signInAest = new Date(signInMs + AEST_OFFSET_MS);

  // Build a Date representing 06:00 AEST on the same calendar day as sign-in
  const cutoffSameDay = new Date(
    Date.UTC(
      signInAest.getUTCFullYear(),
      signInAest.getUTCMonth(),
      signInAest.getUTCDate(),
      CUTOFF_HOUR_AEST, // hour in AEST = UTC hour when offset is subtracted
      0,
      0,
      0,
    ) - AEST_OFFSET_MS, // convert back to UTC epoch
  );

  // If sign-in is already at or past today's 06:00 AEST, use tomorrow's cutoff
  const cutoffMs =
    signInMs >= cutoffSameDay.getTime()
      ? cutoffSameDay.getTime() + 24 * 60 * 60 * 1000
      : cutoffSameDay.getTime();

  return Math.min(hardExpiry, cutoffMs);
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
