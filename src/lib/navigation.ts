/**
 * navigation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Capacitor-safe back navigation.
 *
 * Problem:
 *   In a Capacitor iOS/Android app the browser history stack can be shallow or
 *   empty — deep links, cold starts, and native navigation all bypass the
 *   React Router history. Calling navigate(-1) in those cases silently does
 *   nothing (or exits the webview on Android).
 *
 * Solution:
 *   goBack(navigate, fallback) checks React Router's history index before
 *   deciding:
 *     - index > 0  → navigate(-1)   (normal step-back)
 *     - index <= 0 → navigate(fallback)  (safe parent route)
 *
 * Usage:
 *   import { goBack } from '@/lib/navigation';
 *   const navigate = useNavigate();
 *   <button onClick={() => goBack(navigate, '/home')}>Back</button>
 *
 * Fallback route guide (what each tool page should fall back to):
 *   Tool pages launched from /home dashboard  → '/home'
 *   Tool pages launched from /estimating hub  → '/estimating'
 *   Job sub-pages (/jobs/:id/*)               → `/jobs/${id}`
 *   Studio sub-pages                          → '/studio'
 *   Fleet sub-pages                           → '/fleet'
 *
 * React Router stores its current stack position in history.state.idx. Total
 * browser history length is not reliable because redirects and previous page
 * loads can make it greater than one without a usable in-app Back entry.
 */

import type { NavigateFunction } from 'react-router';

/**
 * Navigate back one step if history allows, otherwise go to `fallback`.
 *
 * @param navigate  The `navigate` function from `useNavigate()`
 * @param fallback  Route to use when history is too shallow (e.g. '/home')
 */
export function goBack(navigate: NavigateFunction, fallback: string): void {
  const internalFallback = fallback.startsWith('/') && !fallback.startsWith('//') ? fallback : '/home';
  if (typeof window === 'undefined') {
    navigate(internalFallback, { replace: true });
    return;
  }

  const state = window.history.state as { idx?: unknown } | null;
  const canGoBack = typeof state?.idx === 'number' && state.idx > 0;
  const currentPath = `${window.location.pathname}${window.location.search}`;
  const safeFallback = internalFallback === currentPath && currentPath !== '/home' ? '/home' : internalFallback;

  if (canGoBack) {
    navigate(-1);
  } else {
    navigate(safeFallback, { replace: true });
  }
}
