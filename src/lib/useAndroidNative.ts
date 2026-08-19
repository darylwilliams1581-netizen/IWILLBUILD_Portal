/**
 * useAndroidNative
 * ─────────────────────────────────────────────────────────────────────────────
 * Android-specific native behaviours:
 *  - Hardware back button handling (exit confirmation instead of blank back)
 *  - Status bar colour matching app theme
 *  - Network connectivity detection via native plugin
 *
 * Safe to call on iOS and web — all Android-specific calls are no-ops.
 */
import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from "react-router";
import { getPlatform, getAppPlugin, getStatusBar, getNetworkPlugin } from './capacitor-plugins';
export function useAndroidNative() {
  const platform = getPlatform();
  const navigate = useNavigate();
  const location = useLocation();
  const [isOnline, setIsOnline] = useState(true);

  // ── Hardware back button ──────────────────────────────────────────────────
  // Android back button: go back in history, or show exit confirmation on root
  useEffect(() => {
    if (platform !== 'android') return;
    let cleanup: (() => void) | undefined;
    Promise.resolve(getAppPlugin()).then(App => {
      if (!App) return;
      const handle = App.addListener('backButton', ({
        canGoBack
      }) => {
        if (canGoBack) {
          navigate(-1);
        } else {
          // On root pages, confirm exit
          if (window.confirm('Exit IWILLBUILD?')) {
            App.exitApp();
          }
        }
      });
      cleanup = () => {
        void handle.then(h => h.remove());
      };
    }).catch(() => undefined);
    return () => cleanup?.();
  }, [platform, navigate, location.pathname]);

  // ── Status bar colour ─────────────────────────────────────────────────────
  // Keep status bar dark to match the portal's dark sidebar theme
  useEffect(() => {
    if (platform !== 'android') return;
    getStatusBar().then(sb => {
      if (!sb) return;
      void sb.StatusBar.setStyle({
        style: sb.Style.Dark
      });
      void sb.StatusBar.setBackgroundColor({
        color: '#111827'
      });
    }).catch(() => undefined);
  }, [platform]);

  // ── Network status ────────────────────────────────────────────────────────
  // Use native network plugin on Android for more reliable connectivity detection
  useEffect(() => {
    if (platform !== 'android') return;
    let cleanup: (() => void) | undefined;
    Promise.resolve(getNetworkPlugin()).then(async Network => {
      if (!Network) return;

      // Get initial status
      const status = await Network.getStatus();
      setIsOnline(status.connected);

      // Listen for changes
      const handle = Network.addListener('networkStatusChange', s => {
        setIsOnline(s.connected);
      });
      cleanup = () => {
        void handle.then(h => h.remove());
      };
    }).catch(() => undefined);
    return () => cleanup?.();
  }, [platform]);

  // ── Immersive mode helper ─────────────────────────────────────────────────
  // Hide status bar for full-screen views (e.g. map full-screen mode)
  const hideStatusBar = useCallback(async () => {
    if (platform !== 'android') return;
    const sb = await getStatusBar();
    if (!sb) return;
    await sb.StatusBar.hide();
  }, [platform]);
  const showStatusBar = useCallback(async () => {
    if (platform !== 'android') return;
    const sb = await getStatusBar();
    if (!sb) return;
    await sb.StatusBar.show();
    await sb.StatusBar.setStyle({
      style: sb.Style.Dark
    });
    await sb.StatusBar.setBackgroundColor({
      color: '#111827'
    });
  }, [platform]);
  return {
    isAndroid: platform === 'android',
    isOnline,
    hideStatusBar,
    showStatusBar
  };
}
