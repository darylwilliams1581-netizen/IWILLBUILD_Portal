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
 *   goBack(navigate, fallback) checks window.history.length before deciding:
 *     - history.length > 1  → navigate(-1)   (normal step-back)
 *     - history.length <= 1 → navigate(fallback)  (safe parent route)
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
 * The threshold of 1 is intentional: a fresh Capacitor webview starts with
 * history.length === 1 (the initial page load). Any real navigation pushes it
 * to 2+, making it safe to go back.
 */

import type { NavigateFunction } from 'react-router';

/**
 * Navigate back one step if history allows, otherwise go to `fallback`.
 *
 * @param navigate  The `navigate` function from `useNavigate()`
 * @param fallback  Route to use when history is too shallow (e.g. '/home')
 */
export function goBack(navigate: NavigateFunction, fallback: string): void {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    navigate(-1);
  } else {
    navigate(fallback, { replace: true });
  }
}
