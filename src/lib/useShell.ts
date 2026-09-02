/**
 * useShell — Two-interface shell detection for IWIIlBUILD.
 * ─────────────────────────────────────────────────────────────────────────────
 * Determines whether the current context should render the mobile App shell
 * (field-first, icon grid, bottom tab bar) or the Office shell (desktop
 * portal, sidebar, tables, management views).
 *
 * Rules (in priority order):
 *   1. Capacitor native app → always 'app'
 *   2. User has manually overridden via localStorage → honour override
 *   3. Viewport width < 768px → 'app'
 *   4. Viewport width ≥ 768px → 'office'
 *
 * The override persists across sessions so a desktop user who prefers the
 * app view keeps it on refresh. The toggle button in the UI calls
 * setShellOverride() to flip it.
 *
 * Usage:
 *   const { shell, isAppShell, isOfficeShell, canToggle, toggleShell } = useShell();
 */

import { useEffect, useState, useCallback } from 'react';
import { isNativeApp } from './native-routing';

export type Shell = 'app' | 'office';

const OVERRIDE_KEY = '__iwb_shell_override__';
const MOBILE_BREAKPOINT = 768; // px — matches Tailwind's md:

function readOverride(): Shell | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(OVERRIDE_KEY);
    if (v === 'app' || v === 'office') return v;
  } catch { /* best-effort */ }
  return null;
}

function writeOverride(shell: Shell | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (shell === null) {
      localStorage.removeItem(OVERRIDE_KEY);
    } else {
      localStorage.setItem(OVERRIDE_KEY, shell);
    }
  } catch { /* best-effort */ }
}

function getViewportShell(): Shell {
  if (typeof window === 'undefined') return 'office';
  return window.innerWidth < MOBILE_BREAKPOINT ? 'app' : 'office';
}

function resolveShell(override: Shell | null, viewportShell: Shell): Shell {
  // Native app always uses app shell — no override possible
  if (isNativeApp) return 'app';
  // User override takes precedence over viewport
  if (override !== null) return override;
  return viewportShell;
}

export function useShell() {
  // IMPORTANT: initialise both to their server-side defaults (null / 'office')
  // so hydrateRoot sees the same tree the server rendered. Reading localStorage
  // or window.innerWidth in the useState initialiser causes React #418 on mobile
  // because the server always returns null / 'office' while the client may return
  // a stored override or 'app' (narrow viewport). The real values are read in the
  // first useEffect (post-hydration) and applied without a hydration mismatch.
  const [override, setOverrideState] = useState<Shell | null>(null);
  const [viewportShell, setViewportShell] = useState<Shell>('office');

  // Read real values post-hydration (avoids #418 — see comment above)
  useEffect(() => {
    setOverrideState(readOverride());
    setViewportShell(getViewportShell());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track viewport width changes (resize + orientation change)
  useEffect(() => {
    function handleResize() {
      setViewportShell(getViewportShell());
    }
    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('orientationchange', handleResize, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const shell = resolveShell(override, viewportShell);

  /**
   * Toggle between app and office shell.
   * On native, this is a no-op (always app).
   * On desktop, this sets/clears the localStorage override.
   */
  const toggleShell = useCallback(() => {
    if (isNativeApp) return;
    const next: Shell = shell === 'app' ? 'office' : 'app';
    writeOverride(next);
    setOverrideState(next);
  }, [shell]);

  /**
   * Explicitly set the shell override.
   * Pass null to clear the override and revert to viewport-based detection.
   */
  const setShellOverride = useCallback((s: Shell | null) => {
    if (isNativeApp) return;
    writeOverride(s);
    setOverrideState(s);
  }, []);

  return {
    /** Current active shell: 'app' | 'office' */
    shell,
    /** True when the app shell (mobile/field) is active */
    isAppShell: shell === 'app',
    /** True when the office shell (desktop/portal) is active */
    isOfficeShell: shell === 'office',
    /** True when the user can toggle shells (false on native — always app) */
    canToggle: !isNativeApp,
    /** Whether a manual override is active */
    hasOverride: override !== null,
    /** Toggle between app and office shell */
    toggleShell,
    /** Set an explicit shell override (null = clear override) */
    setShellOverride,
    /** Raw viewport-based shell (ignores override) */
    viewportShell,
  };
}
