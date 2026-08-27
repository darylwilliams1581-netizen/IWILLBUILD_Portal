/**
 * Session Fetch Interceptor
 *
 * SIMPLIFIED — the x-iwb-session-expires header mechanism has been removed.
 *
 * Previously this interceptor:
 *   1. Attached `x-iwb-session-expires` to every /api/* request so the server
 *      could enforce a client-stamped cutoff independently of BetterAuth.
 *   2. Dispatched `iwb:session:401` when a 401 with code SESSION_EXPIRED was
 *      returned, triggering useSessionTimeout → signOut().
 *
 * Both behaviours are removed because:
 *   - A client-controlled header must not determine whether a valid server
 *     session is revoked. The header was trivially forgeable and caused a
 *     race: an expired/absent localStorage stamp triggered automatic sign-out
 *     ~1 second after a successful login.
 *   - BetterAuth's 30-day server-side session cookie is the sole authority.
 *     ProtectedRoute handles genuine session loss by redirecting to /login.
 *
 * This function is kept as a no-op so existing call sites (main.tsx) compile
 * without changes.
 */

export function installSessionFetchInterceptor(): void {
  // No-op. BetterAuth session cookie is the sole auth authority.
}
