/**
 * useDriverSession
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared hook for the current user's active driving session.
 * Polls every 30s so the header badge stays in sync across tabs.
 *
 * When running inside a Capacitor native shell, GPS position updates are sent
 * via the native Geolocation plugin (more reliable, works on Android background).
 * On web, falls back to browser navigator.geolocation.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { getNativeGeo, isNative } from './capacitor-plugins';

export interface DriverSession {
  id: number;
  fleet_asset_id: number;
  asset_name: string;
  driver_name: string;
  start_at: string;
  status: string;
  source: string;
}

// How often to push a GPS update to the server while a session is active
const GPS_PUSH_INTERVAL_MS = 15_000; // 15s — balance battery vs freshness

export function useDriverSession() {
  const [session, setSession] = useState<DriverSession | null | undefined>(undefined);
  const [error, setError] = useState('');
  const gpsWatchCleanupRef = useRef<(() => void) | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet/driver-sessions/active', { credentials: 'include' });
      if (res.status === 401) { setSession(null); return; }
      const data = await res.json() as { session?: DriverSession | null };
      setSession(data.session ?? null);
    } catch {
      setError('Failed to load driving session');
    }
  }, []);

  // ── Push a GPS position to the server ─────────────────────────────────────
  const pushGps = useCallback(async (sessionId: number) => {
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      let speed: number | null = null;
      let heading: number | null = null;

      const geo = await getNativeGeo();
      if (geo) {
        // Native Capacitor GPS — higher accuracy, works in background on Android
        const pos = await geo.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10_000,
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        speed = pos.coords.speed ?? null;
        heading = pos.coords.heading ?? null;
      } else if (navigator.geolocation) {
        // Web browser fallback
        const pos = await new Promise<GeolocationPosition | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (p) => resolve(p),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5_000 }
          );
        });
        if (pos) {
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          speed = pos.coords.speed ?? null;
          heading = pos.coords.heading ?? null;
        }
      }

      if (lat == null || lng == null) return;

      await fetch(`/api/fleet/driver-sessions/${sessionId}/gps`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, speed_kmh: speed != null ? speed * 3.6 : null, heading }),
      });
    } catch {
      // GPS push failures are non-fatal — session continues
    }
  }, []);

  // ── Start GPS push loop when session is active ─────────────────────────────
  useEffect(() => {
    if (!session?.id) {
      // Clean up any existing GPS watch
      gpsWatchCleanupRef.current?.();
      gpsWatchCleanupRef.current = null;
      return;
    }

    const sessionId = session.id;

    // Push immediately on session start
    void pushGps(sessionId);

    // Then push on interval
    const interval = setInterval(() => void pushGps(sessionId), GPS_PUSH_INTERVAL_MS);

    // On native, also set up a continuous position watch for faster updates
    if (isNative()) {
      getNativeGeo().then((geo) => {
        if (!geo) return;
        geo.watchPosition(
          { enableHighAccuracy: true, timeout: 15_000 },
          (pos, err) => {
            if (err || !pos) return;
            void fetch(`/api/fleet/driver-sessions/${sessionId}/gps`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                speed_kmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : null,
                heading: pos.coords.heading ?? null,
              }),
            }).catch(() => undefined);
          }
        ).then((watchId) => {
          gpsWatchCleanupRef.current = () => void geo.clearWatch({ id: watchId });
        }).catch(() => undefined);
      }).catch(() => undefined);
    }

    return () => {
      clearInterval(interval);
      gpsWatchCleanupRef.current?.();
      gpsWatchCleanupRef.current = null;
    };
  }, [session?.id, pushGps]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function stopSession(sessionId: number): Promise<void> {
    await fetch(`/api/fleet/driver-sessions/${sessionId}/stop`, {
      method: 'POST',
      credentials: 'include',
    });
    setSession(null);
  }

  return { session, error, refresh, stopSession };
}
