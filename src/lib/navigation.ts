/**
 * navigation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Capacitor-safe back navigation.
 *
 * Problem:
 *   In a Capacitor iOS/Android app the browser history stack can be shallow,
 *   stale, or a loop — deep links, cold starts, login reload, closed pickers
 *   and Contacts ↔ Job all sit in WKWebView history. Calling navigate(-1)
 *   then lands on a blank page, a 404, login, or ping-pongs forever.
 *
 * Solution:
 *   goBack(navigate, fallback):
 *     - Native (iOS/Android): always navigate(fallback) with replace.
 *       Never use history -1 inside the shell.
 *     - Web: if React Router idx > 0, one step back; else fallback.
 *
 * Usage:
 *   import { goBack } from '@/lib/navigation';
 *   const navigate = useNavigate();
 *   <button onClick={() => goBack(navigate, '/home')}>Back</button>
 *
 * Fallback route guide (what each tool page should fall back to):
 *   Tool pages launched from /home dashboard  → '/home'
 *   Safety pages                              → '/home?page=2'
 *   Tools (RL / Electrical)                   → '/work?workTab=tools'
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
import { isNative } from './capacitor-plugins';

/**
 * Navigate back one step if history allows, otherwise go to `fallback`.
 * On Capacitor iOS/Android, always use `fallback` — never history -1.
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

  const currentPath = `${window.location.pathname}${window.location.search}`;
  const safeFallback = internalFallback === currentPath && currentPath !== '/home' ? '/home' : internalFallback;

  // Native WKWebView history is not a trustworthy in-app stack.
  if (isNative()) {
    navigate(safeFallback, { replace: true });
    return;
  }

  const state = window.history.state as { idx?: unknown } | null;
  const canGoBack = typeof state?.idx === 'number' && state.idx > 0;

  if (canGoBack) {
    navigate(-1);
  } else {
    navigate(safeFallback, { replace: true });
  }
}
