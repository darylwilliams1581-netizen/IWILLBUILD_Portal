/**
 * appLockStorage.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin localStorage helpers for the app-lock feature.
 *
 * Security model:
 *   - The PIN hash lives SERVER-SIDE in trusted_devices.pin_hash (bcrypt).
 *   - We never store the raw PIN locally.
 *   - We store only:
 *       • device fingerprint  (stable per install, used as the server key)
 *       • device record ID    (returned by POST /api/auth/trusted-devices)
 *       • whether PIN is set  (boolean flag, no secret value)
 *       • lockout state       (attempt count + locked-until timestamp)
 *       • last-locked-at      (so we can re-lock on app resume)
 *
 * All keys are namespaced under `iwb_applock_`.
 * On logout, call clearAppLockState() to wipe everything.
 */

const NS = 'iwb_applock_';

// ── Device fingerprint ────────────────────────────────────────────────────────

/**
 * Returns a stable device fingerprint for this install.
 * On first call it generates and persists one; subsequent calls return the same value.
 * This is the key used to look up the trusted_devices row on the server.
 */
export function getDeviceFingerprint(): string {
  const key = `${NS}fp`;
  let fp = localStorage.getItem(key);
  if (!fp) {
    // Combine several stable signals. Not cryptographically unique but
    // stable enough to identify a device across sessions.
    const ua = navigator.userAgent;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const res = `${screen.width}x${screen.height}`;
    const rand = crypto.getRandomValues(new Uint8Array(8)).join('');
    fp = btoa(`${ua}|${tz}|${res}|${rand}`).slice(0, 128);
    localStorage.setItem(key, fp);
  }
  return fp;
}

// ── PIN registration state ────────────────────────────────────────────────────

interface PinRecord {
  deviceId: string;   // trusted_devices.id
  deviceName: string; // human-readable label
  email: string;      // owner email (used to look up on login page too)
}

const PIN_RECORD_KEY = `${NS}record`;

export function savePinRecord(record: PinRecord): void {
  localStorage.setItem(PIN_RECORD_KEY, JSON.stringify(record));
}

export function getPinRecord(): PinRecord | null {
  try {
    const raw = localStorage.getItem(PIN_RECORD_KEY);
    return raw ? (JSON.parse(raw) as PinRecord) : null;
  } catch {
    return null;
  }
}

export function clearPinRecord(): void {
  localStorage.removeItem(PIN_RECORD_KEY);
}

// ── Lockout state ─────────────────────────────────────────────────────────────
// We mirror the server's lockout locally so we can show the UI immediately
// without a round-trip. The server is always the authoritative source.

interface LockoutState {
  attempts: number;
  lockedUntil: number | null; // epoch ms, or null
}

const LOCKOUT_KEY = `${NS}lockout`;

export function getLockoutState(): LockoutState {
  try {
    const raw = localStorage.getItem(LOCKOUT_KEY);
    return raw ? (JSON.parse(raw) as LockoutState) : { attempts: 0, lockedUntil: null };
  } catch {
    return { attempts: 0, lockedUntil: null };
  }
}

export function saveLockoutState(state: LockoutState): void {
  localStorage.setItem(LOCKOUT_KEY, JSON.stringify(state));
}

export function clearLockoutState(): void {
  localStorage.removeItem(LOCKOUT_KEY);
}

/**
 * Increasing delay schedule (seconds) after each failed attempt:
 *   1 fail  → 0s   (immediate retry)
 *   2 fails → 5s
 *   3 fails → 15s
 *   4 fails → 60s
 *   5+ fails → 300s (5 min, then server locks for 15 min)
 */
export const LOCKOUT_DELAYS_MS = [0, 5_000, 15_000, 60_000, 300_000];

export function delayForAttempt(attempts: number): number {
  const idx = Math.min(attempts, LOCKOUT_DELAYS_MS.length - 1);
  return LOCKOUT_DELAYS_MS[idx];
}

// ── App-lock state ────────────────────────────────────────────────────────────
// Tracks whether the app is currently "locked" (overlay visible).

const LOCKED_AT_KEY = `${NS}locked_at`;

/** Record the moment the app was locked (used to re-lock on resume). */
export function setLockedAt(ts: number): void {
  localStorage.setItem(LOCKED_AT_KEY, String(ts));
}

export function getLockedAt(): number | null {
  const raw = localStorage.getItem(LOCKED_AT_KEY);
  return raw ? Number(raw) : null;
}

export function clearLockedAt(): void {
  localStorage.removeItem(LOCKED_AT_KEY);
}

// ── Full wipe on logout ───────────────────────────────────────────────────────

/** Call this on logout to remove all local app-lock state. */
export function clearAppLockState(): void {
  clearPinRecord();
  clearLockoutState();
  clearLockedAt();
  // Do NOT clear the device fingerprint — it should survive logout so the
  // same device can re-register a PIN after the next login.
}
