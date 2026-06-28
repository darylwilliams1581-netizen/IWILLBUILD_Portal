/**
 * RouteErrorFallback
 * ─────────────────────────────────────────────────────────────────────────────
 * Used as the `errorElement` on every protected route.
 * Renders inside the layout so the sidebar/header stay mounted.
 * Shows a friendly recovery screen with Refresh and Go to Login buttons.
 */
import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { RefreshCw, LogIn, AlertTriangle } from 'lucide-react';

export default function RouteErrorFallback() {
  const error = useRouteError();

  let message = 'An unexpected error occurred on this page.';
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) message = 'This page could not be found.';
    else if (error.status === 403) message = 'You don\'t have permission to view this page.';
    else message = `Server error ${error.status}: ${error.statusText}`;
  } else if (error instanceof Error) {
    // React #310 and similar hook-order errors land here
    message = error.message;
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center min-h-[60vh]">
      <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mb-5">
        <AlertTriangle size={22} className="text-red-400" />
      </div>

      <h2 className="font-heading font-bold text-xl text-slate-900 mb-2">
        Something went wrong
      </h2>
      <p className="text-sm text-slate-500 mb-8 max-w-sm leading-relaxed">
        Please refresh the page or return to login. If the problem keeps happening, try clearing your browser cache.
      </p>

      <div className="flex items-center gap-3">
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-orange-600 transition-colors shadow-sm"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
        <button
          onClick={() => { window.location.href = '/login'; }}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-200 transition-colors"
        >
          <LogIn size={14} />
          Go to Login
        </button>
      </div>

      {/* Dev-only detail */}
      {import.meta.env.DEV && (
        <details className="mt-8 max-w-lg text-left">
          <summary className="text-slate-400 text-xs cursor-pointer hover:text-slate-600">
            Error detail (dev only)
          </summary>
          <pre className="mt-2 text-red-500 text-xs bg-red-50 border border-red-100 rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap">
            {message}
          </pre>
        </details>
      )}
    </div>
  );
}
