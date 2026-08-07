/**
 * BetterAuth Client + Components
 *
 * BetterAuth handles session context internally via cookies and the useSession hook.
 * No explicit React context provider is needed - the authClient manages session state.
 */

import { createAuthClient } from 'better-auth/react';
import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import {
  SESSION_RECOVERY_URL,
  claimSessionRecovery,
  clearSessionRecovery,
} from './session-recovery';
import { clearSessionExpiry } from './session-timeout';
import { isNativeApp } from '@/lib/native-routing';

// Reads and consumes the sessionStorage flag set by useSessionTimeout when it
// initiates a hard redirect to /login?reason=expired. Kept inline to avoid a
// circular import (auth-client → useSessionTimeout → auth-client).
function consumeExpiryRedirectFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const key = '__iwb_expiry_redirect__';
    const val = sessionStorage.getItem(key);
    if (val) { sessionStorage.removeItem(key); return true; }
  } catch { /* best-effort */ }
  return false;
}

// ── Safe auth logger ──────────────────────────────────────────────────────────
// Logs only non-sensitive fields. Never logs passwords or tokens.
function authLog(event: string, data?: Record<string, unknown>) {
  try {
    console.info(JSON.stringify({ event: `auth.${event}`, ...data, ts: Date.now() }));
  } catch {
    // best-effort
  }
}

// Auth client - baseURL must be the full origin for BetterAuth's URL construction.
//
// Safari "Add to Home Screen" (PWA standalone mode) bug: window.location.origin
// returns the literal string "null" in standalone mode on some iOS versions.
// We detect this and fall back to the known production origin so auth requests
// are sent to the correct server instead of "null/api/auth/...".
function getAuthBaseURL(): string {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  // "null" string origin = Safari standalone PWA mode quirk
  if (!origin || origin === 'null') {
    return 'https://iwillbuild.com';
  }
  return origin;
}

const _authClient = createAuthClient({
  baseURL: getAuthBaseURL(),
});

// How long an unsettled session may stay pending before we treat it as a stuck
// stale-cookie state and attempt recovery. Set very high — the pending timeout
// recovery is a last resort for a truly frozen session, not a slow network.
// In practice, an explicit `error` from useSession() triggers recovery immediately;
// the timeout is only a safety net for a session that never resolves at all.
const SESSION_RECOVERY_PENDING_TIMEOUT_MS = 60_000;

/**
 * Clear the stale HttpOnly session cookie server-side, then reload into a clean
 * unauthenticated state. One-shot per tab (see `claimSessionRecovery`) so an
 * unfixable session can't reload-loop.
 */
function recoverFromStaleSession(): void {
  if (typeof window === 'undefined') return;
  if (!claimSessionRecovery(window.sessionStorage)) return;

  void fetch(SESSION_RECOVERY_URL, { cache: 'no-store', credentials: 'include' })
    .catch(() => undefined)
    .finally(() => {
      // Logged so a future "preview keeps reloading" report is diagnosable —
      // more than one of these per tab points at a clear that isn't sticking.
      console.info(JSON.stringify({ event: 'auth.session.recovery.reloading' }));
      window.location.reload();
    });
}

/**
 * Self-heal a stale-cookie session. A failed session lookup is a returned
 * `error`, not a thrown one, so no error boundary fires and the app would sit
 * blank. Recover on an explicit error, or when the session never settles within
 * the pending timeout. A healthy session resets the guard so a later genuine
 * failure can recover again in the same tab.
 *
 * NOTE: We intentionally ignore transient server errors (5xx, network blips)
 * so a momentary DB hiccup doesn't wipe a valid session cookie. Recovery only
 * fires for errors that look like a stale/invalid token (4xx or unknown auth
 * errors), not for server-side failures.
 */
function useStaleSessionRecovery(error: unknown, isPending: boolean, isAuthenticated: boolean): void {
  useEffect(
    function staleSessionRecovery() {
      if (typeof window === 'undefined') return;

      if (error) {
        const msg = String((error as Error)?.message ?? error).toLowerCase();
        // Skip recovery for transient server/network errors — these don't mean
        // the cookie is stale, just that the server had a momentary DB issue.
        const isTransient =
          msg.includes('500') ||
          msg.includes('503') ||
          msg.includes('network') ||
          msg.includes('fetch') ||
          msg.includes('failed to fetch') ||
          msg.includes('connection') ||
          msg.includes('timeout') ||
          msg.includes('inactivity');

        if (isTransient) {
          authLog('session.error.transient', { errorMsg: msg.slice(0, 120) });
          return; // Don't wipe the cookie for a server-side blip
        }

        authLog('session.error', { errorMsg: msg.slice(0, 120) });
        recoverFromStaleSession();
        return;
      }
      if (isAuthenticated) {
        clearSessionRecovery(window.sessionStorage);
        return;
      }
      if (!isPending) return;

      const timer = setTimeout(recoverFromStaleSession, SESSION_RECOVERY_PENDING_TIMEOUT_MS);
      return () => clearTimeout(timer);
    },
    [error, isPending, isAuthenticated],
  );
}

export const authClient = _authClient;
export const { signIn, signUp, signOut } = _authClient;

/**
 * useSession — null-safe session hook.
 *
 * Returns `user` as a top-level nullable field and `isAuthenticated` as a
 * boolean so components naturally handle the unauthenticated state:
 *
 *   const { user, isAuthenticated, isPending } = useSession();
 *   if (isPending) return <Spinner />;
 *   return isAuthenticated ? <span>{user.name}</span> : <a href="/login">Sign In</a>;
 */
export function useSession() {
  const { data: session, isPending, error } = _authClient.useSession();

  // Treat transient server/network errors as still-pending rather than
  // unauthenticated. A MySQL idle-timeout on the server returns a 500 which
  // BetterAuth surfaces as an error object — we don't want that to flash the
  // login redirect or trigger stale-session recovery.
  const isTransientError = (() => {
    if (!error) return false;
    const msg = String((error as Error)?.message ?? error).toLowerCase();
    return (
      msg.includes('500') ||
      msg.includes('503') ||
      msg.includes('network') ||
      msg.includes('failed to fetch') ||
      msg.includes('connection') ||
      msg.includes('timeout') ||
      msg.includes('inactivity')
    );
  })();

  const effectiveError = isTransientError ? null : error;
  const isAuthenticated = !isPending && !isTransientError && !!session?.user;

  useStaleSessionRecovery(effectiveError, isPending || isTransientError, isAuthenticated);

  return {
    session,
    user: session?.user ?? null,
    isPending: isPending || isTransientError,
    error: effectiveError,
    isAuthenticated,
  };
}
// Alias for useSession (common naming convention)
export function useAuth() { return useSession(); }

/**
 * SessionProvider - Wrapper for compatibility with common auth patterns.
 *
 * BetterAuth manages session state internally through cookies and the useSession hook,
 * so no React context is needed. This component is provided for API compatibility
 * with apps that expect a provider wrapper pattern (e.g., migrating from NextAuth).
 *
 * You can safely wrap your app with this, but it's optional.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// Alias for SessionProvider (common naming convention in auth libraries)
export const AuthProvider = SessionProvider;

// Session timeout for loading state — generous to avoid false "timed out" screens
// in the preview iframe where the first session fetch can be slow.
const SESSION_TIMEOUT_MS = 90_000;

// ProtectedRoute component with timeout handling
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isPending } = useSession();
  const location = useLocation();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!isPending) return;
    const timeout = setTimeout(() => {
      authLog('protected_route.timeout', { path: location.pathname });
      setTimedOut(true);
    }, SESSION_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [isPending, location.pathname]);

  // Log redirect to login
  useEffect(() => {
    if (!isPending && !isAuthenticated) {
      authLog('protected_route.redirect_to_login', { from: location.pathname });
    }
  }, [isPending, isAuthenticated, location.pathname]);

  if (timedOut) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#0F1117]">
        <p className="text-white/50 text-sm">Session check timed out. Please try again.</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-white rounded-md hover:bg-violet-700 text-sm font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isPending || typeof window === 'undefined') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F1117]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // If useSessionTimeout already handled the expiry redirect (signOut + navigate
    // to /login?reason=expired), don't fire a second silent redirect that would
    // strip the ?reason=expired param. The flag is consumed once so subsequent
    // unauthenticated checks still redirect normally.
    const wasExpiryRedirect = consumeExpiryRedirectFlag();
    if (wasExpiryRedirect) {
      // Already navigating — render nothing while React Router processes the popstate
      return null;
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

/**
 * LogoutButton - Button to sign out the user
 *
 * Handles the sign-out process and redirects to login page.
 * Can be customized with className prop.
 */
export function LogoutButton({
  className = '',
  children = 'Logout',
}: {
  className?: string;
  children?: ReactNode;
}) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout() {
    setIsLoading(true);
    try {
      clearSessionExpiry(); // clear 14h / 06:00 cutoff stamp
      await signOut();
      // Native app → always return to login (never the public landing page)
      // Web browser → /login (same behaviour, landing page is at /)
      window.location.href = isNativeApp ? '/login' : '/login';
    } catch (error) {
      console.error('Logout failed:', error);
      setIsLoading(false);
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={isLoading}
      className={className || 'px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md disabled:opacity-50'}
    >
      {isLoading ? 'Logging out...' : children}
    </button>
  );
}
