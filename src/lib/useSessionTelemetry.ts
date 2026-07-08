/**
 * useSessionTelemetry
 *
 * Collects GPS points via the Geolocation API during an active driving session
 * and batches them to POST /api/fleet/driver-sessions/:id/telemetry every 30s.
 *
 * Rules:
 * - Only runs when sessionId is non-null and settings allow at least one metric.
 * - Stops cleanly on unmount or when sessionId becomes null.
 * - Queues points locally if the network request fails; retries on next flush.
 * - Never shows speed on the map UI — speed is only sent to the server.
 * - Falls back gracefully if Geolocation is unavailable.
 */
import { useEffect, useRef, useCallback } from 'react';
import type { FleetAnalyticsSettings } from './useFleetAnalytics';

export interface TelemetryPoint {
  recorded_at: string;
  lat: number;
  lng: number;
  speed_kmh?: number | null;
  heading?: number | null;
  accuracy_m?: number | null;
  is_collision?: boolean;
}

const FLUSH_INTERVAL_MS = 30_000;   // flush every 30 seconds
const WATCH_INTERVAL_MS = 5_000;    // poll GPS every 5 seconds (fallback)
const MAX_QUEUE_SIZE    = 1_000;    // safety cap

export function useSessionTelemetry(
  sessionId: number | null,
  settings: FleetAnalyticsSettings,
) {
  const queueRef     = useRef<TelemetryPoint[]>([]);
  const watchIdRef   = useRef<number | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<number | null>(sessionId);

  // Keep ref in sync so flush closure always has the latest sessionId
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  const shouldTrack = !!(
    settings.track_distance ||
    settings.track_drive_time ||
    settings.track_speed ||
    settings.enable_collision_alerts
  );

  const addPoint = useCallback((pos: GeolocationPosition) => {
    if (!shouldTrack) return;
    const pt: TelemetryPoint = {
      recorded_at: new Date(pos.timestamp).toISOString(),
      lat:         pos.coords.latitude,
      lng:         pos.coords.longitude,
      accuracy_m:  pos.coords.accuracy ?? null,
      heading:     pos.coords.heading  ?? null,
      // speed from Geolocation API is m/s — convert to km/h
      speed_kmh:   settings.track_speed && pos.coords.speed != null
        ? Math.round(pos.coords.speed * 3.6 * 10) / 10
        : null,
    };
    if (queueRef.current.length < MAX_QUEUE_SIZE) {
      queueRef.current.push(pt);
    }
  }, [shouldTrack, settings.track_speed]);

  const flush = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid || queueRef.current.length === 0) return;

    const batch = queueRef.current.splice(0, 200); // send up to 200 at a time
    try {
      const res = await fetch(`/api/fleet/driver-sessions/${sid}/telemetry`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: batch }),
      });
      if (!res.ok) {
        // Re-queue on failure (prepend so order is preserved)
        queueRef.current.unshift(...batch);
      }
    } catch {
      // Network error — re-queue
      queueRef.current.unshift(...batch);
    }
  }, []);

  useEffect(() => {
    if (!sessionId || !shouldTrack) return;

    // Start GPS watch
    if ('geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        addPoint,
        (err) => console.warn('Geolocation error:', err.message),
        { enableHighAccuracy: true, maximumAge: 4_000, timeout: 10_000 },
      );
    } else {
      // Fallback: poll at interval (less accurate but still records route)
      const pollId = setInterval(() => {
        navigator.geolocation?.getCurrentPosition(addPoint, undefined, {
          enableHighAccuracy: false,
          maximumAge: WATCH_INTERVAL_MS,
        });
      }, WATCH_INTERVAL_MS);
      watchIdRef.current = pollId as unknown as number;
    }

    // Flush timer
    flushTimerRef.current = setInterval(() => { void flush(); }, FLUSH_INTERVAL_MS);

    return () => {
      // Stop GPS
      if (watchIdRef.current !== null) {
        if ('geolocation' in navigator) {
          navigator.geolocation.clearWatch(watchIdRef.current);
        } else {
          clearInterval(watchIdRef.current);
        }
        watchIdRef.current = null;
      }
      // Stop flush timer
      if (flushTimerRef.current !== null) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      // Final flush on unmount
      void flush();
    };
  }, [sessionId, shouldTrack, addPoint, flush]);

  /** Call this when a collision event is detected (e.g. accelerometer spike) */
  function reportCollision() {
    if (!settings.enable_collision_alerts) return;
    navigator.geolocation?.getCurrentPosition((pos) => {
      const pt: TelemetryPoint = {
        recorded_at: new Date().toISOString(),
        lat:         pos.coords.latitude,
        lng:         pos.coords.longitude,
        accuracy_m:  pos.coords.accuracy ?? null,
        is_collision: true,
      };
      queueRef.current.push(pt);
      void flush(); // flush immediately on collision
    });
  }

  return { reportCollision };
}
