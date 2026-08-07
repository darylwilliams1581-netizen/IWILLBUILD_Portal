/**
 * useCapacitor
 * ─────────────────────────────────────────────────────────────────────────────
 * Central hook for Capacitor native features.
 * Safe to call on web — all native calls are no-ops when not in a native shell.
 *
 * Usage:
 *   const { isNative, platform, requestGpsPermission, getCurrentPosition } = useCapacitor();
 */
import { useEffect, useState, useCallback } from 'react';
import {
  isNative as checkNative,
  getPlatform,
  getNativeGeo,
  hapticImpact,
  hapticSuccess,
  hapticError,
  hapticWarning,
  getStatusBar,
  getSplashScreen,
  getAppPlugin,
} from './capacitor-plugins';

export interface CapacitorGpsPosition {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  altitude: number | null;
  timestamp: number;
}

export function useCapacitor() {
  const [native] = useState(() => checkNative());
  const [platform] = useState(() => getPlatform());
  const [appActive, setAppActive] = useState(true);

  // ── App foreground/background state ────────────────────────────────────────
  useEffect(() => {
    if (!native) return;
    let cleanup: (() => void) | undefined;

    Promise.resolve(getAppPlugin()).then((App) => {
      if (!App) return;
      const handle = App.addListener('appStateChange', ({ isActive }) => {
        setAppActive(isActive);
      });
      cleanup = () => { void handle.then(h => h.remove()); };
    }).catch(() => undefined);

    return () => cleanup?.();
  }, [native]);

  // ── Hide splash screen once app is ready ───────────────────────────────────
  useEffect(() => {
    if (!native) return;
    getSplashScreen().then((splash) => {
      if (!splash) return;
      // Small delay so the first render is visible before hiding splash
      setTimeout(() => void splash.hide({ fadeOutDuration: 300 }), 300);
    }).catch(() => undefined);
  }, [native]);

  // ── Status bar ─────────────────────────────────────────────────────────────
  const setStatusBarDark = useCallback(async () => {
    const sb = await getStatusBar();
    if (!sb) return;
    await sb.StatusBar.setStyle({ style: sb.Style.Dark });
    await sb.StatusBar.setBackgroundColor({ color: '#111827' });
  }, []);

  // ── GPS permission ─────────────────────────────────────────────────────────
  const requestGpsPermission = useCallback(async (): Promise<'granted' | 'denied' | 'web'> => {
    const geo = await getNativeGeo();
    if (!geo) {
      // Web fallback — use browser geolocation permission
      if (!navigator.geolocation) return 'denied';
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve('granted'),
          () => resolve('denied'),
          { timeout: 5000 }
        );
      });
    }

    try {
      const status = await geo.requestPermissions({ permissions: ['location'] });
      const loc = status.location ?? status.coarseLocation;
      if (loc === 'granted') return 'granted';
      return 'denied';
    } catch {
      return 'denied';
    }
  }, []);

  // ── Get current GPS position ───────────────────────────────────────────────
  const getCurrentPosition = useCallback(async (): Promise<CapacitorGpsPosition | null> => {
    const geo = await getNativeGeo();

    if (geo) {
      // Native — high accuracy, no timeout issues
      try {
        const pos = await geo.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
        });
        return {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed ?? null,
          heading: pos.coords.heading ?? null,
          altitude: pos.coords.altitude ?? null,
          timestamp: pos.timestamp,
        };
      } catch {
        return null;
      }
    }

    // Web fallback — browser geolocation
    if (!navigator.geolocation) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed ?? null,
          heading: pos.coords.heading ?? null,
          altitude: pos.coords.altitude ?? null,
          timestamp: pos.timestamp,
        }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
    });
  }, []);

  // ── Watch GPS position (continuous) ───────────────────────────────────────
  const watchPosition = useCallback(async (
    callback: (pos: CapacitorGpsPosition) => void,
    onError?: (err: string) => void
  ): Promise<() => void> => {
    const geo = await getNativeGeo();

    if (geo) {
      // Native watch — more reliable, works in background on Android
      try {
        const watchId = await geo.watchPosition(
          { enableHighAccuracy: true, timeout: 15000 },
          (pos, err) => {
            if (err) { onError?.(err.message); return; }
            if (!pos) return;
            callback({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              speed: pos.coords.speed ?? null,
              heading: pos.coords.heading ?? null,
              altitude: pos.coords.altitude ?? null,
              timestamp: pos.timestamp,
            });
          }
        );
        return () => { void geo.clearWatch({ id: watchId }); };
      } catch {
        return () => undefined;
      }
    }

    // Web fallback
    if (!navigator.geolocation) return () => undefined;
    const id = navigator.geolocation.watchPosition(
      (pos) => callback({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        speed: pos.coords.speed ?? null,
        heading: pos.coords.heading ?? null,
        altitude: pos.coords.altitude ?? null,
        timestamp: pos.timestamp,
      }),
      (err) => onError?.(err.message),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  return {
    isNative: native,
    platform,
    appActive,
    // GPS
    requestGpsPermission,
    getCurrentPosition,
    watchPosition,
    // Haptics (safe no-ops on web)
    hapticImpact,
    hapticSuccess,
    hapticError,
    hapticWarning,
    // Status bar
    setStatusBarDark,
  };
}
