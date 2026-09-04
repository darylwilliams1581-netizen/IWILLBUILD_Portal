/**
 * useAppLifecycle
 * ─────────────────────────────────────────────────────────────────────────────
 * Listens to Capacitor App state changes (foreground / background) and the
 * browser's online/offline events, then calls the provided callbacks.
 *
 * On iOS, the Capacitor App plugin fires 'appStateChange' with:
 *   { isActive: true }  — app came to foreground
 *   { isActive: false } — app went to background
 *
 * On web, we fall back to the Page Visibility API (visibilitychange).
 *
 * Usage:
 *   useAppLifecycle({
 *     onForeground: () => syncNow(),
 *     onBackground: () => pauseUploads(),
 *   });
 *
 * Safe to call on web — all Capacitor calls are guarded by isNative().
 */

import { useEffect, useRef } from 'react';
import { isNative, getAppPlugin } from '@/lib/capacitor-plugins';

interface AppLifecycleOptions {
  /** Called when the app returns to the foreground (or tab becomes visible) */
  onForeground?: () => void;
  /** Called when the app goes to the background (or tab becomes hidden) */
  onBackground?: () => void;
  /** Called when the device comes online */
  onOnline?: () => void;
  /** Called when the device goes offline */
  onOffline?: () => void;
}

type AppPlugin = {
  addListener: (
    event: 'appStateChange',
    handler: (state: { isActive: boolean }) => void,
  ) => Promise<{ remove: () => void }>;
};

export function useAppLifecycle({
  onForeground,
  onBackground,
  onOnline,
  onOffline,
}: AppLifecycleOptions) {
  // Stable refs so the effect doesn't re-run when callbacks change identity
  const onForegroundRef = useRef(onForeground);
  const onBackgroundRef = useRef(onBackground);
  const onOnlineRef     = useRef(onOnline);
  const onOfflineRef    = useRef(onOffline);

  useEffect(() => { onForegroundRef.current = onForeground; }, [onForeground]);
  useEffect(() => { onBackgroundRef.current = onBackground; }, [onBackground]);
  useEffect(() => { onOnlineRef.current     = onOnline;     }, [onOnline]);
  useEffect(() => { onOfflineRef.current    = onOffline;    }, [onOffline]);

  useEffect(() => {
    const cleanups: Array<() => void> = [];

    // ── Capacitor App state (native) ─────────────────────────────────────────
    if (isNative()) {
      // getAppPlugin() validates that addListener is callable before returning —
      // returns null if the bridge stub is not yet fully initialised (TestFlight
      // cold-start race). Safe to call unconditionally.
      const AppPlugin = getAppPlugin() as AppPlugin | null;
      if (AppPlugin) {
        void AppPlugin.addListener('appStateChange', (state) => {
          if (state.isActive) {
            onForegroundRef.current?.();
          } else {
            onBackgroundRef.current?.();
          }
        }).then((handle) => {
          cleanups.push(() => handle.remove());
        }).catch(() => undefined);
      }
    } else {
      // ── Page Visibility API (web / PWA) ────────────────────────────────────
      const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          onForegroundRef.current?.();
        } else {
          onBackgroundRef.current?.();
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);
      cleanups.push(() => document.removeEventListener('visibilitychange', handleVisibility));
    }

    // ── Network events (both native and web) ─────────────────────────────────
    const handleOnline  = () => onOnlineRef.current?.();
    const handleOffline = () => onOfflineRef.current?.();
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    cleanups.push(
      () => window.removeEventListener('online',  handleOnline),
      () => window.removeEventListener('offline', handleOffline),
    );

    return () => cleanups.forEach((fn) => fn());
  }, []); // run once — callbacks are accessed via stable refs
}
