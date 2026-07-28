/**
 * RouteErrorFallback
 * ─────────────────────────────────────────────────────────────────────────────
 * Used as the `errorElement` on every protected route.
 * Renders inside the layout so the sidebar/header stay mounted.
 * Shows a friendly recovery screen with Refresh, Go to Login, and
 * "Clear session & go to login" buttons.
 */
import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { RefreshCw, LogIn, AlertTriangle, ShieldOff } from 'lucide-react';
import { invalidateMeCache } from '@/lib/usePermissions';
import { invalidateSubscriptionCache } from '@/lib/useSubscriptionGate';
import { invalidateTerminologyCache } from '@/lib/useTerminology';
import { invalidateSupportModeCache } from '@/lib/useSupportMode';
import { signOut } from '@/lib/auth/auth-client';

function clearAllCachesAndGoToLogin() {
  try {
    invalidateMeCache();
    invalidateSubscriptionCache();
    invalidateTerminologyCache();
    invalidateSupportModeCache();
  } catch {
    // best-effort
  }
  window.location.replace('/login');
}

/** Sign out (best-effort) then navigate to /login so the login page
 *  doesn't immediately bounce back to the broken route. */
async function signOutAndGoToLogin() {
  try {
    invalidateMeCache();
    invalidateSubscriptionCache();
    invalidateTerminologyCache();
    invalidateSupportModeCache();
  } catch { /* best-effort */ }
  try {
    await signOut();
  } catch { /* best-effort — even if signOut fails, navigate away */ }
  window.location.replace('/login');
}

export default function RouteErrorFallback() {
  const error = useRouteError();

  // ── Stale shim auto-reload ──────────────────────────────────────────────────
  // The stale sos-shim snapshot (t=1784519099416) throws NotFoundError from its
  // patchedRemoveChild. React Router's RenderErrorBoundary catches it before
  // SosInterceptBoundary/StaleShimBoundary (which sit outside RouterProvider).
  // Detect it here and trigger a one-shot reload to evict the stale module.
  const STALE_TS = ['1784519099416', '1784518714435', '1784516505220', '1784585282530', '1784589710474', '1784590013856', '1784800000000'];
  function isStaleShimError(e: unknown): boolean {
    if (!(e instanceof Error)) return false;
    const text = (e.message ?? '') + (e.stack ?? '');
    if (e.name === 'NotFoundError' && text.includes('removeChild')) return true;
    return STALE_TS.some((ts) => text.includes(ts));
  }

  if (isStaleShimError(error)) {
    try {
      const RELOAD_KEY = 'route_stale_reload_ts';
      const last = parseInt(sessionStorage.getItem(RELOAD_KEY) ?? '0', 10);
      if (Date.now() - last > 4000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
      }
    } catch { /* ignore */ }
    // Render nothing while reload is in flight
    return null;
  }
  // ── End stale shim guard ────────────────────────────────────────────────────

  let message = 'An unexpected error occurred on this page.';
  let stack = '';
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) message = 'This page could not be found.';
    else if (error.status === 403) message = "You don't have permission to view this page.";
    else message = `Server error ${error.status}: ${error.statusText}`;
  } else if (error instanceof Error) {
    message = error.message;
    stack = error.stack ?? '';
  } else if (error) {
    message = String(error);
  }

  // Always log to console so it appears in preview logs
  console.error('[RouteErrorFallback]', message, stack || error);

  // Detect if this looks like a session/auth error
  const isAuthError =
    isRouteErrorResponse(error) && (error.status === 401 || error.status === 403);

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center min-h-[60vh]">
      <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mb-5">
        <AlertTriangle size={22} className="text-red-400" />
      </div>

      <h2 className="font-heading font-bold text-xl text-slate-900 mb-2">
        Something went wrong
      </h2>
      <p className="text-sm text-slate-500 mb-8 max-w-sm leading-relaxed">
        Please refresh the page or return to login. If the problem keeps happening, try clearing your session.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition-colors shadow-sm"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
        <button
          onClick={() => void signOutAndGoToLogin()}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-200 transition-colors"
        >
          <LogIn size={14} />
          Go to Login
        </button>
        {isAuthError && (
          <button
            onClick={clearAllCachesAndGoToLogin}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white text-sm font-bold rounded-xl hover:bg-slate-700 transition-colors"
          >
            <ShieldOff size={14} />
            Clear session &amp; go to login
          </button>
        )}
      </div>

      {/* Always show the clear-session option as a subtle link */}
      {!isAuthError && (
        <button
          onClick={clearAllCachesAndGoToLogin}
          className="mt-5 text-xs text-slate-600 hover:text-slate-800 underline underline-offset-2 transition-colors"
        >
          Clear session &amp; go to login
        </button>
      )}

      {/* Error detail — always visible so the error can be diagnosed */}
      <details className="mt-8 max-w-lg w-full text-left" open>
        <summary className="text-slate-400 text-xs cursor-pointer hover:text-slate-600">
          Error detail
        </summary>
        <pre className="mt-2 text-red-500 text-xs bg-red-50 border border-red-100 rounded-lg p-3 overflow-auto max-h-60 whitespace-pre-wrap">
          {message}
          {stack ? `\n\n${stack}` : ''}
        </pre>
      </details>
    </div>
  );
}
