/**
 * useDriverSession
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared hook for the current user's active driving session.
 * Polls every 30s so the header badge stays in sync across tabs.
 *
 * When running inside a Capacitor native shell, GPS position updates are sent
 * via the native Geolocation plugin (more reliable, works on Android background).
 * On web, falls back to browser navigator.geolocation.
 *
 * GPS status heartbeat:
 * Sends location_permission_status + gps_status to the server every 30s
 * (and on permission/GPS state changes) so the office Fleet view can show
 * meaningful status rather than "No GPS yet".
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { getNativeGeo, isNative } from './capacitor-plugins';
import type { GpsPermissionStatus } from './useGpsPermission';

export interface DriverSession {
  id: number;
  fleet_asset_id: number;
  asset_name: string;
  driver_name: string;
  start_at: string;
  status: string;
  source: string;
}

export type GpsStatusValue =
  | 'live'
  | 'waiting_permission'
  | 'denied'
  | 'unavailable'
  | 'waiting_fix'
  | 'stale';

// How often to push a GPS update to the server while a session is active
const GPS_PUSH_INTERVAL_MS = 15_000; // 15s — balance battery vs freshness

// How often to send a heartbeat (permission + GPS status) even without a GPS fix
const HEARTBEAT_INTERVAL_MS = 30_000; // 30s — matches session refresh cadence

export function useDriverSession() {
  const [session, setSession] = useState<DriverSession | null | undefined>(undefined);
  const [error, setError] = useState('');
  const gpsWatchCleanupRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true); // guards against setState after unmount

  // Track the latest permission + GPS status so heartbeats always send current values
  const permStatusRef  = useRef<GpsPermissionStatus>('unknown');
  const gpsStatusRef   = useRef<GpsStatusValue>('waiting_fix');
  const sessionIdRef   = useRef<number | null>(null);

  // Mark unmounted on cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet/driver-sessions/active', { credentials: 'include' });
      if (res.status === 401) { if (mountedRef.current) setSession(null); return; }
      const data = await res.json() as { session?: DriverSession | null };
      if (mountedRef.current) setSession(data.session ?? null);
    } catch {
      if (mountedRef.current) setError('Failed to load driving session');
    }
  }, []);

  // ── Send a heartbeat (permission + GPS status) ─────────────────────────────
  const sendHeartbeat = useCallback(async (
    sessionId: number,
    locationPermissionStatus: GpsPermissionStatus,
    gpsStatus: GpsStatusValue,
  ) => {
    try {
      await fetch(`/api/fleet/driver-sessions/${sessionId}/heartbeat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationPermissionStatus, gpsStatus }),
      });
    } catch {
      // Heartbeat failures are non-fatal
    }
  }, []);

  // ── Push a GPS position to the server ─────────────────────────────────────
  const pushGps = useCallback(async (sessionId: number) => {
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      let speed: number | null = null;
      let heading: number | null = null;
      let accuracy: number | null = null;

      const geo = await getNativeGeo();
      if (geo) {
        // Native Capacitor GPS — higher accuracy, works in background on Android
        // Hard 10s timeout: getCurrentPosition can hang indefinitely on iOS if
        // the plugin is registered but the OS hasn't granted a fix yet.
        const pos = await Promise.race([
          geo.getCurrentPosition({ enableHighAccuracy: true, timeout: 10_000 }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('GPS getCurrentPosition timed out')), 10_500)
          ),
        ]);
        lat      = pos.coords.latitude;
        lng      = pos.coords.longitude;
        speed    = pos.coords.speed ?? null;
        heading  = pos.coords.heading ?? null;
        accuracy = pos.coords.accuracy ?? null;
      } else if (navigator.geolocation) {
        // Web browser fallback — already has a 10s timeout in the options
        const pos = await new Promise<GeolocationPosition | null>((resolve) => {
          const timer = setTimeout(() => resolve(null), 11_000); // safety net
          navigator.geolocation.getCurrentPosition(
            (p) => { clearTimeout(timer); resolve(p); },
            () => { clearTimeout(timer); resolve(null); },
            { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5_000 }
          );
        });
        if (pos) {
          lat      = pos.coords.latitude;
          lng      = pos.coords.longitude;
          speed    = pos.coords.speed ?? null;
          heading  = pos.coords.heading ?? null;
          accuracy = pos.coords.accuracy ?? null;
        }
      }

      if (lat == null || lng == null) {
        // Got no fix — update GPS status to waiting_fix and send heartbeat
        if (gpsStatusRef.current !== 'denied' && gpsStatusRef.current !== 'unavailable') {
          gpsStatusRef.current = 'waiting_fix';
          void sendHeartbeat(sessionId, permStatusRef.current, 'waiting_fix');
        }
        return;
      }

      // We have a fix — push to telemetry endpoint (correct endpoint: /telemetry with points array)
      await fetch(`/api/fleet/driver-sessions/${sessionId}/telemetry`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [{
            recorded_at: new Date().toISOString(),
            lat,
            lng,
            speed_kmh: speed != null ? speed * 3.6 : null,
            heading,
            accuracy_m: accuracy,
          }],
        }),
      });

      // Update GPS status to live and send heartbeat
      gpsStatusRef.current = 'live';
      void sendHeartbeat(sessionId, permStatusRef.current, 'live');
    } catch {
      // GPS push failures are non-fatal — session continues
    }
  }, [sendHeartbeat]);

  // ── Expose a method for DriverGpsStatus to report permission/GPS state ─────
  // Called by DriverGpsStatus whenever its local state changes.
  const reportGpsState = useCallback((
    permStatus: GpsPermissionStatus,
    gpsStatus: GpsStatusValue,
  ) => {
    permStatusRef.current = permStatus;
    gpsStatusRef.current  = gpsStatus;
    const sid = sessionIdRef.current;
    if (sid != null) {
      void sendHeartbeat(sid, permStatus, gpsStatus);
    }
  }, [sendHeartbeat]);

  // ── Start GPS push loop when session is active ─────────────────────────────
  useEffect(() => {
    if (!session?.id) {
      gpsWatchCleanupRef.current?.();
      gpsWatchCleanupRef.current = null;
      sessionIdRef.current = null;
      return;
    }

    const sessionId = session.id;
    sessionIdRef.current = sessionId;

    // Send initial heartbeat immediately (even before GPS fix)
    void sendHeartbeat(sessionId, permStatusRef.current, gpsStatusRef.current);

    // Push GPS immediately on session start
    void pushGps(sessionId);

    // GPS push interval
    const gpsInterval = setInterval(() => void pushGps(sessionId), GPS_PUSH_INTERVAL_MS);

    // Heartbeat interval — keeps office informed even when GPS is denied/unavailable
    const heartbeatInterval = setInterval(
      () => void sendHeartbeat(sessionId, permStatusRef.current, gpsStatusRef.current),
      HEARTBEAT_INTERVAL_MS,
    );

    // On native, also set up a continuous position watch for faster updates
    if (isNative()) {
      Promise.resolve(getNativeGeo()).then((geo) => {
        if (!geo) return;
        geo.watchPosition(
          { enableHighAccuracy: true, timeout: 15_000 },
          (pos, err) => {
            if (err || !pos) {
              gpsStatusRef.current = 'waiting_fix';
              void sendHeartbeat(sessionId, permStatusRef.current, 'waiting_fix');
              return;
            }
            // Push to telemetry
            void fetch(`/api/fleet/driver-sessions/${sessionId}/telemetry`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                points: [{
                  recorded_at: new Date().toISOString(),
                  lat: pos.coords.latitude,
                  lng: pos.coords.longitude,
                  speed_kmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : null,
                  heading: pos.coords.heading ?? null,
                  accuracy_m: pos.coords.accuracy ?? null,
                }],
              }),
            }).catch(() => undefined);
            // Update GPS status
            gpsStatusRef.current = 'live';
          }
        ).then((watchId) => {
          gpsWatchCleanupRef.current = () => void geo.clearWatch({ id: watchId });
        }).catch(() => undefined);
      }).catch(() => undefined);
    }

    return () => {
      clearInterval(gpsInterval);
      clearInterval(heartbeatInterval);
      gpsWatchCleanupRef.current?.();
      gpsWatchCleanupRef.current = null;
    };
  }, [session?.id, pushGps, sendHeartbeat]);

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
    sessionIdRef.current = null;
  }

  return { session, error, refresh, stopSession, reportGpsState };
}

