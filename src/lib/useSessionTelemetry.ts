/**
 * useSessionTelemetry
 *
 * Collects GPS points via the Geolocation API during an active driving session
 * and batches them to POST /api/fleet/driver-sessions/:id/telemetry every 30s.
 *
 * Rules:
 * - Starts GPS as soon as sessionId is non-null — does NOT wait for settings to
 *   load. This prevents a race where the settings fetch completes after mount,
 *   flips shouldTrack, tears down the watch, and the driver never gets a GPS fix.
 * - Settings are read via a ref so they never cause the watch effect to re-run.
 * - Stops cleanly on unmount or when sessionId becomes null.
 * - Queues points locally if the network request fails; retries on next flush.
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

const FLUSH_INTERVAL_MS = 30_000;  // flush every 30 seconds
const FIRST_FLUSH_MS    = 5_000;   // flush first point quickly so map shows driver fast
const POLL_INTERVAL_MS  = 5_000;   // fallback poll interval when watchPosition unavailable
const MAX_QUEUE_SIZE    = 1_000;   // safety cap

export function useSessionTelemetry(
  sessionId: number | null,
  settings: FleetAnalyticsSettings,
) {
  const queueRef        = useRef<TelemetryPoint[]>([]);
  const watchIdRef      = useRef<number | null>(null);
  const flushTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const firstFlushRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushedFirstRef = useRef(false);
  const sessionIdRef    = useRef<number | null>(sessionId);
  // Keep settings in a ref so changing settings never tears down the GPS watch
  const settingsRef     = useRef<FleetAnalyticsSettings>(settings);

  // Keep refs in sync without triggering the GPS effect
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const flush = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid || queueRef.current.length === 0) return;

    const batch = queueRef.current.splice(0, 200);
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

  const addPoint = useCallback((pos: GeolocationPosition) => {
    const s = settingsRef.current;
    const pt: TelemetryPoint = {
      recorded_at: new Date(pos.timestamp).toISOString(),
      lat:         pos.coords.latitude,
      lng:         pos.coords.longitude,
      accuracy_m:  pos.coords.accuracy ?? null,
      heading:     pos.coords.heading  ?? null,
      // speed from Geolocation API is m/s — convert to km/h
      speed_kmh:   s.track_speed && pos.coords.speed != null
        ? Math.round(pos.coords.speed * 3.6 * 10) / 10
        : null,
    };
    if (queueRef.current.length < MAX_QUEUE_SIZE) {
      queueRef.current.push(pt);
    }
    // On the very first GPS point, schedule a fast flush so the live map
    // shows the driver within seconds rather than waiting 30s.
    if (!flushedFirstRef.current && firstFlushRef.current === null) {
      firstFlushRef.current = setTimeout(() => {
        flushedFirstRef.current = true;
        firstFlushRef.current = null;
        void flush();
      }, FIRST_FLUSH_MS);
    }
  }, [flush]);

  // GPS watch effect — only depends on sessionId, NOT on settings.
  // Settings are read via settingsRef so they never cause a teardown/restart.
  useEffect(() => {
    if (!sessionId) return;

    // Reset first-flush state for new session
    flushedFirstRef.current = false;

    // Start GPS watch
    if ('geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        addPoint,
        (err) => console.warn('Geolocation error:', err.code, err.message),
        { enableHighAccuracy: true, maximumAge: 4_000, timeout: 15_000 },
      );
    } else {
      // Fallback: poll at interval (less accurate but still records route)
      const pollId = setInterval(() => {
        navigator.geolocation?.getCurrentPosition(addPoint, undefined, {
          enableHighAccuracy: false,
          maximumAge: POLL_INTERVAL_MS,
        });
      }, POLL_INTERVAL_MS);
      watchIdRef.current = pollId as unknown as number;
    }

    // Regular flush timer
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
      // Cancel fast first-flush timer
      if (firstFlushRef.current !== null) {
        clearTimeout(firstFlushRef.current);
        firstFlushRef.current = null;
      }
      // Stop flush timer
      if (flushTimerRef.current !== null) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      // Final flush on unmount
      void flush();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]); // intentionally omit addPoint/flush — they're stable callbacks

  /** Call this when a collision event is detected (e.g. accelerometer spike) */
  function reportCollision() {
    if (!settingsRef.current.enable_collision_alerts) return;
    navigator.geolocation?.getCurrentPosition((pos) => {
      const pt: TelemetryPoint = {
        recorded_at: new Date().toISOString(),
        lat:         pos.coords.latitude,
        lng:         pos.coords.longitude,
        accuracy_m:  pos.coords.accuracy ?? null,
        is_collision: true,
      };
      queueRef.current.push(pt);
      void flush();
    });
  }

  return { reportCollision };
}
