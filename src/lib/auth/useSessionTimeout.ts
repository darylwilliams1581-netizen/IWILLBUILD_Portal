/**
 * useSessionTimeout
 *
 * NEUTRALISED — BetterAuth server session is the sole expiry authority.
 *
 * This hook previously enforced a client-side localStorage expiry stamp
 * (iwb_session_expires_at) and called signOut() when that stamp expired.
 * That mechanism caused a race condition: the stamp could be expired (or
 * absent) when PortalSidebar mounted immediately after login, triggering an
 * automatic POST /api/auth/sign-out ~1 second after a successful login.
 *
 * The fix: BetterAuth's 30-day server-side session cookie is the only
 * authority. This hook now:
 *   - Exports SESSION_401_EVENT for import compatibility (no longer dispatched)
 *   - Returns { isExpired: false } always — the banner never fires from here
 *   - Does NOT call signOut(), does NOT redirect, does NOT read localStorage
 *
 * Genuine session expiry is handled by:
 *   - ProtectedRoute: redirects to /login when BetterAuth returns no session
 *   - BetterAuth cookie expiry: server rejects requests after 30 days
 *   - Manual logout buttons in PortalSidebar / DesktopTopBar
 */

export const SESSION_401_EVENT = 'iwb:session:401';

export function useSessionTimeout() {
  // Always returns non-expired. ProtectedRoute handles genuine session loss.
  return { isExpired: false };
}
