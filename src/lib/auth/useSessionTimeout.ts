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
 *     server-side, clears the localStorage key, and navigates directly to
 *     /login?reason=expired (preserving the current path as `from` state so
 *     the user lands back where they were after re-login).
 *   - Also sets `isExpired = true` so PortalSidebar can render the banner
 *     for the brief moment before navigation completes.
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
  stampSessionExpiry,
} from '@/lib/auth/session-timeout';
import { setExpiryRedirectFlag } from '@/lib/auth/expiry-redirect-flag';

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

    // Navigate directly to /login?reason=expired, preserving the current path
    // so the user lands back here after re-login. Hard redirect because signOut()
    // has already cleared the BetterAuth session — a soft React Router navigate
    // would race with ProtectedRoute's own unauthenticated redirect.
    if (typeof window !== 'undefined') {
      setExpiryRedirectFlag();
      const from = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?reason=expired&from=${from}`;
    }
  }

  useEffect(() => {
    // ── 1. Check localStorage expiry ─────────────────────────────────────────
    const expiresAt = readSessionExpiry();

    if (expiresAt !== null) {
      const ms = msUntilExpiry(expiresAt);
      if (ms <= 0) {
        // Stamp is expired — but it may be a stale old-format stamp (e.g. from
        // the previous 14h/06:00 cutoff logic). Clear it and re-stamp with the
        // current 30-day window rather than immediately logging the user out.
        // The BetterAuth cookie is still the authoritative auth mechanism.
        clearSessionExpiry();
        stampSessionExpiry();
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

