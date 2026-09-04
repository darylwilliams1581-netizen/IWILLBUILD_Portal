/**
 * useAppLock.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Core hook for the app-lock feature (native iOS only).
 *
 * Responsibilities:
 *   • Track whether the app is currently locked
 *   • Trigger lock when the app goes to background (Capacitor App events)
 *   • Expose verifyPin() — calls the server, handles lockout
 *   • Expose tryFaceId() — calls NativeBiometric if available
 *   • Expose lockNow() / unlock() for manual control
 *   • Expose lockout state (attempts, lockedUntil, secondsRemaining)
 *
 * Security guarantees:
 *   • PIN verification always goes to the server (bcrypt compare)
 *   • We never store the raw PIN or the hash locally
 *   • Lockout is enforced both locally (UX) and server-side (authoritative)
 *   • Unlocking does NOT create a new server session — it only lifts the
 *     local overlay. The existing BetterAuth session cookie is still required.
 *   • On session expiry the normal SessionExpiredBanner still fires.
 *
 * Native-only: this hook returns a no-op state on web.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getAppPlugin, getHapticsPlugin } from '@/lib/capacitor-plugins';
import { isNativeApp } from '@/lib/native-routing';
import {
  getDeviceFingerprint,
  getPinRecord,
  getLockoutState,
  saveLockoutState,
  clearLockoutState,
  setLockedAt,
  getLockedAt,
  clearLockedAt,
  delayForAttempt,
} from './appLockStorage';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AppLockState {
  /** Whether the lock overlay should be shown */
  isLocked: boolean;
  /** Whether a PIN has been set up on this device */
  hasPinSetup: boolean;
  /** Whether Face ID is available on this device */
  hasFaceId: boolean;
  /** Current failed-attempt count (resets on success) */
  failedAttempts: number;
  /** Epoch ms when the lockout expires, or null */
  lockedUntil: number | null;
  /** Seconds remaining in lockout countdown (0 if not locked out) */
  secondsRemaining: number;
  /** Whether a PIN verify request is in flight */
  verifying: boolean;
  /** Last error message from verifyPin / tryFaceId */
  error: string;
  /** Verify a PIN against the server */
  verifyPin: (pin: string) => Promise<boolean>;
  /** Attempt Face ID unlock */
  tryFaceId: () => Promise<boolean>;
  /** Lock the app immediately */
  lockNow: () => void;
  /** Unlock (called internally after successful verify) */
  unlock: () => void;
  /** Clear all local lock state (call on logout) */
  clearOnLogout: () => void;
}

// ── Biometric plugin interface ────────────────────────────────────────────────
// @capacitor-community/native-biometric is not installed, so we use the
// window.Capacitor.Plugins bridge directly with a type-safe wrapper.

interface NativeBiometricPlugin {
  isAvailable: () => Promise<{ isAvailable: boolean; biometryType?: number }>;
  verifyIdentity: (opts: { reason: string; title: string; subtitle?: string; description?: string }) => Promise<void>;
}

function getBiometricPlugin(): NativeBiometricPlugin | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  const plugin = cap?.Plugins?.['NativeBiometric'];
  return (plugin as NativeBiometricPlugin) ?? null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const NOOP_STATE: AppLockState = {
  isLocked: false,
  hasPinSetup: false,
  hasFaceId: false,
  failedAttempts: 0,
  lockedUntil: null,
  secondsRemaining: 0,
  verifying: false,
  error: '',
  verifyPin: async () => false,
  tryFaceId: async () => false,
  lockNow: () => {},
  unlock: () => {},
  clearOnLogout: () => {},
};

export function useAppLock(): AppLockState {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const nativeState = useAppLockNative();
  // Web — return no-op
  if (!isNativeApp) return NOOP_STATE;
  return nativeState;
}

function useAppLockNative(): AppLockState {
  const pinRecord = getPinRecord();
  const hasPinSetup = !!pinRecord;

  const [isLocked, setIsLocked] = useState<boolean>(() => {
    // On mount: if a PIN is set up and we have a locked_at timestamp, start locked.
    if (!hasPinSetup) return false;
    return getLockedAt() !== null;
  });

  const [hasFaceId, setHasFaceId] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  const lockoutInit = getLockoutState();
  const [failedAttempts, setFailedAttempts] = useState(lockoutInit.attempts);
  const [lockedUntil, setLockedUntil] = useState<number | null>(lockoutInit.lockedUntil);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Detect Face ID availability ───────────────────────────────────────────
  useEffect(() => {
    const bio = getBiometricPlugin();
    if (!bio) return;
    bio.isAvailable()
      .then(({ isAvailable }) => setHasFaceId(isAvailable))
      .catch(() => setHasFaceId(false));
  }, []);

  // ── Countdown timer for lockout ───────────────────────────────────────────
  useEffect(() => {
    if (!lockedUntil) {
      setSecondsRemaining(0);
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }

    function tick() {
      const remaining = Math.max(0, Math.ceil((lockedUntil! - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining === 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        setLockedUntil(null);
        saveLockoutState({ attempts: failedAttempts, lockedUntil: null });
      }
    }

    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedUntil]);

  // ── App resume → re-lock ──────────────────────────────────────────────────
  useEffect(() => {
    if (!hasPinSetup) return;

    // getAppPlugin() validates addListener is callable before returning.
    // Returns null if the bridge stub is not yet fully initialised (TestFlight
    // cold-start race) — skip silently rather than crashing.
    const App = getAppPlugin();
    if (!App) return;

    let removeListener: (() => void) | null = null;

    try {
      App.addListener('appStateChange', (state: unknown) => {
        const { isActive } = state as { isActive: boolean };
        if (!isActive) {
          // App going to background — record lock time
          setLockedAt(Date.now());
        } else {
          // App coming to foreground — if we have a locked_at, show lock screen
          const lockedAt = getLockedAt();
          if (lockedAt !== null) {
            setIsLocked(true);
            setError('');
          }
        }
      }).then((handle: { remove: () => void }) => {
        removeListener = handle.remove;
      }).catch(() => {});
    } catch (err) {
      // Bridge not ready — fail silently; lock screen will still show on next
      // foreground event once the bridge is fully initialised.
      console.warn('[useAppLock] addListener failed (bridge not ready):', err);
    }

    return () => { removeListener?.(); };
  }, [hasPinSetup]);

  // ── unlock ────────────────────────────────────────────────────────────────
  const unlock = useCallback(() => {
    setIsLocked(false);
    clearLockedAt();
    setError('');
    clearLockoutState();
    setFailedAttempts(0);
    setLockedUntil(null);

    const h = getHapticsPlugin();
    h?.Haptics.notification({ type: 'SUCCESS' }).catch(() => {});
  }, []);

  // ── lockNow ───────────────────────────────────────────────────────────────
  const lockNow = useCallback(() => {
    if (!hasPinSetup) return;
    setLockedAt(Date.now());
    setIsLocked(true);
    setError('');
  }, [hasPinSetup]);

  // ── verifyPin ─────────────────────────────────────────────────────────────
  const verifyPin = useCallback(async (pin: string): Promise<boolean> => {
    if (!pinRecord) return false;

    // Local lockout guard
    if (lockedUntil && lockedUntil > Date.now()) {
      setError(`Too many attempts. Try again in ${Math.ceil((lockedUntil - Date.now()) / 1000)}s.`);
      return false;
    }

    if (!/^\d{4,6}$/.test(pin)) {
      setError('PIN must be 4–6 digits.');
      return false;
    }

    setVerifying(true);
    setError('');

    try {
      const fp = getDeviceFingerprint();
      const res = await fetch('/api/auth/pin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: pinRecord.email, pin, deviceFingerprint: fp }),
      });
      const data = await res.json() as {
        ok?: boolean;
        error?: string;
        lockedUntil?: string;
      };

      if (res.ok && data.ok) {
        // Success — reset local lockout
        clearLockoutState();
        setFailedAttempts(0);
        setLockedUntil(null);
        unlock();
        return true;
      }

      // Failed — apply increasing delay
      const newAttempts = failedAttempts + 1;
      const delay = delayForAttempt(newAttempts);
      const until = delay > 0 ? Date.now() + delay : null;

      setFailedAttempts(newAttempts);
      setLockedUntil(until);
      saveLockoutState({ attempts: newAttempts, lockedUntil: until });

      // If server sent a lockedUntil, use that (it's authoritative)
      if (data.lockedUntil) {
        const serverUntil = new Date(data.lockedUntil).getTime();
        setLockedUntil(serverUntil);
        saveLockoutState({ attempts: newAttempts, lockedUntil: serverUntil });
      }

      setError(data.error ?? 'Incorrect PIN.');
      const h = getHapticsPlugin();
      h?.Haptics.notification({ type: 'ERROR' }).catch(() => {});
      return false;
    } catch {
      setError('Network error. Check your connection and try again.');
      return false;
    } finally {
      setVerifying(false);
    }
  }, [pinRecord, failedAttempts, lockedUntil, unlock]);

  // ── tryFaceId ─────────────────────────────────────────────────────────────
  const tryFaceId = useCallback(async (): Promise<boolean> => {
    const bio = getBiometricPlugin();
    if (!bio) return false;

    try {
      await bio.verifyIdentity({
        reason: 'Unlock iwillbuild',
        title: 'Face ID',
        subtitle: 'Use Face ID to unlock the app',
      });
      // Biometric success — unlock without a server round-trip
      // (the server session is still valid; we're just lifting the local overlay)
      unlock();
      return true;
    } catch {
      // User cancelled or Face ID failed — fall through to PIN
      return false;
    }
  }, [unlock]);

  // ── clearOnLogout ─────────────────────────────────────────────────────────
  const clearOnLogout = useCallback(() => {
    setIsLocked(false);
    setFailedAttempts(0);
    setLockedUntil(null);
    setError('');
    clearLockedAt();
    clearLockoutState();
    // Note: we do NOT clear the pin record here — the user may want to
    // re-use their PIN after the next login. clearPinRecord() is called
    // explicitly from PinSetupModal when the user disables PIN.
  }, []);

  return {
    isLocked,
    hasPinSetup,
    hasFaceId,
    failedAttempts,
    lockedUntil,
    secondsRemaining,
    verifying,
    error,
    verifyPin,
    tryFaceId,
    lockNow,
    unlock,
    clearOnLogout,
  };
}
