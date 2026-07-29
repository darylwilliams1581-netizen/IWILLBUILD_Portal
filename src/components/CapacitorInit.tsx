/**
 * CapacitorInit
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs once on mount inside a Capacitor native shell (iOS / Android).
 *
 * Responsibilities:
 *   1. Hide the splash screen after the first React paint — without this the
 *      app stays on the launch screen forever (white screen in TestFlight).
 *   2. Set the status bar style to match the app's dark theme.
 *
 * Design decisions:
 *   - launchAutoHide: false in capacitor.config.json means the native layer
 *     will NOT auto-dismiss the splash — we MUST call hide() here.
 *   - launchShowDuration: 3000 is a safety net: if this component never mounts
 *     (e.g. a JS crash before first render), the native layer auto-hides after
 *     3 seconds so the user is never stuck on a black/white screen.
 *   - We call hide() at 400ms so React has had at least one full paint cycle
 *     and the UI is visible before the splash fades out.
 *   - The timeout is cleared on unmount to prevent calling hide() on an
 *     already-unmounted component.
 *   - All calls are no-ops on web (isNative() returns false in a browser).
 *
 * Safe to render on web — all native calls are guarded by isNative().
 */
import { useEffect } from 'react';
import { getSplashScreen, getStatusBar, isNative } from '@/lib/capacitor-plugins';

export default function CapacitorInit() {
  useEffect(() => {
    if (!isNative()) return;

    let splashTimer: ReturnType<typeof setTimeout> | null = null;

    // ── Splash screen hide ────────────────────────────────────────────────────
    // 400ms gives React one full paint cycle so the app UI is visible before
    // the splash fades. The native launchShowDuration: 3000 acts as a fallback
    // if this component never mounts (JS crash, etc.).
    getSplashScreen()
      .then((splash) => {
        if (!splash) return;
        splashTimer = setTimeout(() => {
          void splash.hide({ fadeOutDuration: 300 });
        }, 400);
      })
      .catch(() => undefined);

    // ── Status bar ────────────────────────────────────────────────────────────
    // Dark style + dark background matches the app's deep purple/dark theme.
    getStatusBar()
      .then((sb) => {
        if (!sb) return;
        void sb.StatusBar.setStyle({ style: sb.Style.Dark });
        void sb.StatusBar.setBackgroundColor({ color: '#111827' });
      })
      .catch(() => undefined);

    return () => {
      if (splashTimer !== null) clearTimeout(splashTimer);
    };
  }, []); // run once on mount only

  return null;
}
