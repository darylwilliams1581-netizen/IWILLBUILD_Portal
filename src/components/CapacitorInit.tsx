/**
 * CapacitorInit
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs once on mount inside a native Capacitor shell (iOS / Android).
 * - Hides the splash screen after the first render (prevents white screen)
 * - Sets the status bar to dark style with the app's dark background colour
 *
 * Renders nothing — purely a side-effect component.
 * Safe to mount on web (all calls are no-ops when not in a native shell).
 */
import { useEffect } from 'react';
import { getSplashScreen, getStatusBar, isNative } from '@/lib/capacitor-plugins';

export default function CapacitorInit() {
  useEffect(() => {
    if (!isNative()) return;

    // Hide splash screen — without this the app stays on the launch screen forever.
    // 400ms delay gives React one full paint cycle so the UI is visible before fade.
    getSplashScreen()
      .then((splash) => {
        if (!splash) return;
        setTimeout(() => {
          void splash.hide({ fadeOutDuration: 300 });
        }, 400);
      })
      .catch(() => undefined);

    // Status bar — dark style matches the app's deep purple/dark theme.
    getStatusBar()
      .then((sb) => {
        if (!sb) return;
        void sb.StatusBar.setStyle({ style: sb.Style.Dark });
        void sb.StatusBar.setBackgroundColor({ color: '#111827' });
      })
      .catch(() => undefined);
  }, []); // run once on mount only

  return null;
}
