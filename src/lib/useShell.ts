/**
 * useShell — Two-interface shell detection for IWIllBUIlD.
 * ─────────────────────────────────────────────────────────────────────────────
 * Determines whether the current context should render the mobile App shell
 * (field-first, icon grid, bottom tab bar) or the Office shell (desktop
 * portal, sidebar, tables, management views).
 *
 * Rules (in priority order):
 *   1. Capacitor native app → always 'app'
 *   2. User has manually overridden via localStorage → honour override
 *   3. Browser (any viewport) → 'office'
 *
 * The override persists across sessions so a website user who prefers the
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

function resolveShell(override: Shell | null): Shell {
  // Native app always uses app shell — no override possible
  if (isNativeApp) return 'app';
  // User override takes precedence
  if (override !== null) return override;
  // Browser default: always office (never auto-switch to app on narrow viewport)
  return 'office';
}

export function useShell() {
  // IMPORTANT: initialise to null / 'office' (server-side defaults) so
  // hydrateRoot sees the same tree the server rendered. Real values are
  // read post-hydration in the first useEffect to avoid React #418.
  const [override, setOverrideState] = useState<Shell | null>(null);

  // Read real override post-hydration (avoids #418 — see comment above)
  useEffect(() => {
    setOverrideState(readOverride());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shell = resolveShell(override);

  /**
   * Toggle between app and office shell.
   * On native, this is a no-op (always app).
   * On browser, this sets/clears the localStorage override.
   */
  const toggleShell = useCallback(() => {
    if (isNativeApp) return;
    const next: Shell = shell === 'app' ? 'office' : 'app';
    writeOverride(next);
    setOverrideState(next);
  }, [shell]);

  /**
   * Explicitly set the shell override.
   * Pass null to clear the override and revert to the default (office on browser).
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
    /** Set an explicit shell override (null = clear override, reverts to office on browser) */
    setShellOverride,
    /** Kept for compatibility — always 'office' on browser, 'app' on native */
    viewportShell: isNativeApp ? 'app' as Shell : 'office' as Shell,
  };
}
