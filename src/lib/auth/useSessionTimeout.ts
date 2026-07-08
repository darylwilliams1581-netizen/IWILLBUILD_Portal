/**
 * useSessionTimeout
 *
 * Client-side session timeout enforcement.
 *
 * Behaviour:
 *   - Reads the stored `iwb_session_expires_at` from localStorage.
 *   - If already expired on mount → immediately marks as expired.
 *   - Otherwise schedules a single setTimeout for the exact ms until expiry.
 *   - When expired: calls signOut() to invalidate the BetterAuth session
 *     server-side, clears the localStorage key, and sets `isExpired = true`.
 *   - The caller renders <SessionExpiredBanner /> when isExpired is true;
 *     the banner auto-redirects to /login after a short countdown.
 *
 * Also handles 401 responses from the API (e.g. server-side expiry check
 * fired before the client timer). Listens for a custom DOM event
 * "iwb:session:401" dispatched by the API client interceptor.
 *
 * Mount this hook once — inside PortalSidebar so it runs on every portal page.
 */

import { useEffect, useState, useRef } from 'react';
import { signOut } from '@/lib/auth/auth-client';
import {
  readSessionExpiry,
  clearSessionExpiry,
  msUntilExpiry,
} from '@/lib/auth/session-timeout';

export const SESSION_401_EVENT = 'iwb:session:401';

export function useSessionTimeout() {
  const [isExpired, setIsExpired] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function expire() {
    // Clear timer so it doesn't double-fire
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    clearSessionExpiry();
    try {
      // Tell BetterAuth to invalidate the server-side session
      await signOut();
    } catch {
      // Best-effort — even if signOut fails, we still redirect
    }
    setIsExpired(true);
  }

  useEffect(() => {
    // ── 1. Check localStorage expiry ─────────────────────────────────────────
    const expiresAt = readSessionExpiry();

    if (expiresAt !== null) {
      const ms = msUntilExpiry(expiresAt);
      if (ms <= 0) {
        // Already expired — fire immediately
        void expire();
        return;
      }
      // Schedule expiry
      timerRef.current = setTimeout(() => void expire(), ms);
    }

    // ── 2. Listen for 401 events from API calls ───────────────────────────────
    function on401() {
      void expire();
    }
    window.addEventListener(SESSION_401_EVENT, on401);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener(SESSION_401_EVENT, on401);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isExpired };
}
