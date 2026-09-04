/**
 * DriverSessionContext
 * ─────────────────────────────────────────────────────────────────────────────
 * Application-level provider for the current user's active driving session.
 *
 * LIFECYCLE DEFECT THIS FIXES
 * ───────────────────────────
 * Previously, useDriverSession() was mounted inside /driver (DriverPage).
 * Navigating away from /driver unmounted the component, which stopped:
 *   - The native GPS watchPosition
 *   - The 15-second GPS push interval
 *   - The 30-second heartbeat interval
 * The session remained active on the server but GPS reporting stopped.
 *
 * FIX
 * ───
 * Mount DriverSessionProvider once in RootLayout (authenticated scope).
 * It stays alive while navigating between pages. GPS tracking continues
 * until the session ends or the user logs out.
 *
 * RULES
 * ─────
 * - Does NOT request location permission automatically on startup.
 *   Permission must be requested by a deliberate user action (Enable Location /
 *   Start Drive Session). After permission is granted and a session is active,
 *   this provider starts/resumes tracking.
 * - Only one GPS watcher exists at any time (guarded by watchActiveRef).
 * - Only one telemetry interval exists at any time.
 * - Restarts the watcher when the Capacitor app returns to the foreground.
 * - Stops all tracking on logout (session becomes null).
 * - Correctly reports gps_status only after the server confirms stored > 0.
 *
 * GPS STATUS VALUES
 * ─────────────────
 * waiting_permission  — permission not yet requested or still at prompt
 * granted             — permission granted (internal; mapped to waiting_fix until fix)
 * denied              — permission denied by user
 * unavailable         — geolocation not supported / OS-level unavailable
 * waiting_fix         — permission granted but no coordinate received yet
 * live                — coordinate received AND server confirmed stored > 0
 * stale               — last accepted point is older than STALE_THRESHOLD_MS
 *
 * DIAGNOSTICS
 * ───────────
 * All diagnostic logs are prefixed [DriverSession] and are safe to ship:
 * they never log exact coordinates in production (only boolean "coord acquired").
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { getNativeGeo, isNative } from './capacitor-plugins';
import type { GpsPermissionStatus } from './useGpsPermission';

// ── Types ─────────────────────────────────────────────────────────────────────

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

export interface DriverSessionContextValue {
  /** undefined = loading, null = no session, DriverSession = active */
  session: DriverSession | null | undefined;
  error: string;
  /** Current GPS status as reported to the server */
  gpsStatus: GpsStatusValue;
  /** Refresh the session from the server */
  refresh: () => Promise<void>;
  /** Stop the active session */
  stopSession: (sessionId: number) => Promise<void>;
  /**
   * Called by DriverGpsStatus (or any component) to report the current
   * permission + GPS state. Triggers a heartbeat to the server.
   */
  reportGpsState: (permStatus: GpsPermissionStatus, gpsStatus: GpsStatusValue) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** How often to push a GPS update while a session is active */
const GPS_PUSH_INTERVAL_MS = 15_000;

/** How often to send a heartbeat (permission + GPS status) */
const HEARTBEAT_INTERVAL_MS = 30_000;

/** How old a last-accepted point must be before we call it stale */
const STALE_THRESHOLD_MS = 120_000; // 2 minutes

const IS_DEV = import.meta.env.DEV;

function diag(msg: string, data?: Record<string, unknown>) {
  if (IS_DEV) {
    console.log(`[DriverSession] ${msg}`, data ?? '');
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

const DriverSessionContext = createContext<DriverSessionContextValue | null>(null);

export function useDriverSessionContext(): DriverSessionContextValue {
  const ctx = useContext(DriverSessionContext);
  if (!ctx) {
    throw new Error('useDriverSessionContext must be used inside DriverSessionProvider');
  }
  return ctx;
}

/**
 * Safe variant — returns null when called outside DriverSessionProvider.
 * Use this in components that may render outside the provider (e.g. DesktopTopBar).
 */
export function useDriverSessionSafe(): DriverSessionContextValue | null {
  return useContext(DriverSessionContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────

interface Props { children: ReactNode }

export function DriverSessionProvider({ children }: Props) {
  const [session, setSession]   = useState<DriverSession | null | undefined>(undefined);
  const [error, setError]       = useState('');
  const [gpsStatus, setGpsStatus] = useState<GpsStatusValue>('waiting_permission');

  // Refs — never cause re-renders, safe to read inside intervals/callbacks
  const mountedRef      = useRef(true);
  const sessionIdRef    = useRef<number | null>(null);
  const permStatusRef   = useRef<GpsPermissionStatus>('unknown');
  const gpsStatusRef    = useRef<GpsStatusValue>('waiting_permission');
  const watchActiveRef  = useRef(false);   // prevents duplicate watchers
  const lastAcceptedRef = useRef<number | null>(null); // timestamp of last stored point

  // Interval handles
  const gpsIntervalRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nativeWatchCleanupRef = useRef<(() => void) | null>(null);
  const webWatchIdRef         = useRef<number | null>(null);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function setGpsStatusBoth(s: GpsStatusValue) {
    gpsStatusRef.current = s;
    if (mountedRef.current) setGpsStatus(s);
  }

  // ── Heartbeat ───────────────────────────────────────────────────────────────

  const sendHeartbeat = useCallback(async (
    sessionId: number,
    locationPermissionStatus: GpsPermissionStatus,
    gpsStatusVal: GpsStatusValue,
  ) => {
    try {
      await fetch(`/api/fleet/driver-sessions/${sessionId}/heartbeat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationPermissionStatus, gpsStatus: gpsStatusVal }),
      });
      diag('heartbeat sent', { sessionId, locationPermissionStatus, gpsStatus: gpsStatusVal });
    } catch {
      diag('heartbeat failed (non-fatal)');
    }
  }, []);

  // ── Push a single GPS point ──────────────────────────────────────────────────

  const pushGpsPoint = useCallback(async (
    sessionId: number,
    lat: number,
    lng: number,
    speed: number | null,
    heading: number | null,
    accuracy: number | null,
  ) => {
    try {
      const res = await fetch(`/api/fleet/driver-sessions/${sessionId}/telemetry`, {
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

      if (!res.ok) {
        diag('telemetry rejected by server', { status: res.status });
        return false;
      }

      const data = await res.json() as { ok?: boolean; stored?: number; skipped?: number };
      const stored = data.stored ?? 0;

      diag('telemetry response', { stored, skipped: data.skipped ?? 0 });

      // Only mark live if the server confirmed at least one point was stored.
      // (stored === 0 means tracking is disabled in analytics settings — still OK,
      //  but we don't claim "live" since no data was persisted.)
      if (stored > 0) {
        lastAcceptedRef.current = Date.now();
        setGpsStatusBoth('live');
        void sendHeartbeat(sessionId, permStatusRef.current, 'live');
        return true;
      }

      // stored === 0 — analytics disabled, not an error; don't change gps_status
      return false;
    } catch {
      diag('telemetry fetch failed (non-fatal)');
      return false;
    }
  }, [sendHeartbeat]);

  // ── getCurrentPosition wrapper ───────────────────────────────────────────────

  const getCurrentPositionOnce = useCallback(async (): Promise<{
    lat: number; lng: number; speed: number | null;
    heading: number | null; accuracy: number | null;
  } | null> => {
    const geo = await getNativeGeo();
    if (geo) {
      try {
        const pos = await Promise.race([
          geo.getCurrentPosition({ enableHighAccuracy: true, timeout: 10_000 }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('GPS getCurrentPosition timed out')), 10_500)
          ),
        ]);
        diag('native GPS fix acquired (coord omitted in prod)');
        return {
          lat:      pos.coords.latitude,
          lng:      pos.coords.longitude,
          speed:    pos.coords.speed ?? null,
          heading:  pos.coords.heading ?? null,
          accuracy: pos.coords.accuracy ?? null,
        };
      } catch {
        diag('native GPS getCurrentPosition failed');
        return null;
      }
    }

    if (!navigator.geolocation) {
      diag('geolocation unavailable');
      return null;
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 11_000);
      navigator.geolocation.getCurrentPosition(
        (p) => {
          clearTimeout(timer);
          diag('web GPS fix acquired (coord omitted in prod)');
          resolve({
            lat:      p.coords.latitude,
            lng:      p.coords.longitude,
            speed:    p.coords.speed ?? null,
            heading:  p.coords.heading ?? null,
            accuracy: p.coords.accuracy ?? null,
          });
        },
        () => { clearTimeout(timer); resolve(null); },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5_000 }
      );
    });
  }, []);

  // ── Interval GPS push (fallback / supplement to watchPosition) ──────────────

  const pushGpsNow = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;

    // If permission is denied/unavailable, don't attempt
    const perm = permStatusRef.current;
    if (perm === 'denied' || perm === 'unavailable') {
      setGpsStatusBoth(perm === 'denied' ? 'denied' : 'unavailable');
      void sendHeartbeat(sid, perm, gpsStatusRef.current);
      return;
    }

    const fix = await getCurrentPositionOnce();
    if (!fix) {
      if (gpsStatusRef.current !== 'denied' && gpsStatusRef.current !== 'unavailable') {
        setGpsStatusBoth('waiting_fix');
        void sendHeartbeat(sid, permStatusRef.current, 'waiting_fix');
      }
      return;
    }

    await pushGpsPoint(sid, fix.lat, fix.lng, fix.speed, fix.heading, fix.accuracy);
  }, [getCurrentPositionOnce, pushGpsPoint, sendHeartbeat]);

  // ── Start native watchPosition ───────────────────────────────────────────────

  const startNativeWatch = useCallback((sessionId: number) => {
    if (watchActiveRef.current) {
      diag('watchPosition already active — skipping duplicate start');
      return;
    }

    Promise.resolve(getNativeGeo()).then((geo) => {
      if (!geo) {
        diag('native geo not available — relying on interval push');
        return;
      }

      diag('starting native watchPosition', { sessionId });
      watchActiveRef.current = true;

      geo.watchPosition(
        { enableHighAccuracy: true, timeout: 15_000 },
        (pos, err) => {
          if (err || !pos) {
            diag('native watchPosition error', { code: err?.code });
            setGpsStatusBoth('waiting_fix');
            void sendHeartbeat(sessionId, permStatusRef.current, 'waiting_fix');
            return;
          }
          diag('native watchPosition fix (coord omitted in prod)');
          void pushGpsPoint(
            sessionId,
            pos.coords.latitude,
            pos.coords.longitude,
            pos.coords.speed ?? null,
            pos.coords.heading ?? null,
            pos.coords.accuracy ?? null,
          );
        }
      ).then((watchId) => {
        nativeWatchCleanupRef.current = () => {
          diag('clearing native watchPosition');
          watchActiveRef.current = false;
          void geo.clearWatch({ id: watchId });
        };
      }).catch(() => {
        watchActiveRef.current = false;
        diag('native watchPosition setup failed');
      });
    }).catch(() => {
      diag('getNativeGeo threw');
    });
  }, [pushGpsPoint, sendHeartbeat]);

  // ── Start web watchPosition ──────────────────────────────────────────────────

  const startWebWatch = useCallback((sessionId: number) => {
    if (watchActiveRef.current) {
      diag('web watchPosition already active — skipping duplicate start');
      return;
    }
    if (!navigator.geolocation) {
      diag('navigator.geolocation unavailable');
      return;
    }

    diag('starting web watchPosition', { sessionId });
    watchActiveRef.current = true;

    webWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        diag('web watchPosition fix (coord omitted in prod)');
        void pushGpsPoint(
          sessionId,
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.speed ?? null,
          pos.coords.heading ?? null,
          pos.coords.accuracy ?? null,
        );
      },
      (err) => {
        diag('web watchPosition error', { code: err.code, message: err.message });
        if (err.code === 1) {
          setGpsStatusBoth('denied');
          void sendHeartbeat(sessionId, 'denied', 'denied');
        } else {
          setGpsStatusBoth('waiting_fix');
          void sendHeartbeat(sessionId, permStatusRef.current, 'waiting_fix');
        }
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 }
    );
  }, [pushGpsPoint, sendHeartbeat]);

  // ── Stop all GPS watchers ────────────────────────────────────────────────────

  const stopWatchers = useCallback(() => {
    nativeWatchCleanupRef.current?.();
    nativeWatchCleanupRef.current = null;

    if (webWatchIdRef.current !== null) {
      navigator.geolocation?.clearWatch(webWatchIdRef.current);
      webWatchIdRef.current = null;
    }

    watchActiveRef.current = false;
    diag('GPS watchers stopped');
  }, []);

  // ── Stop all intervals ───────────────────────────────────────────────────────

  const stopIntervals = useCallback(() => {
    if (gpsIntervalRef.current) {
      clearInterval(gpsIntervalRef.current);
      gpsIntervalRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    diag('GPS intervals stopped');
  }, []);

  // ── Start tracking for a session ─────────────────────────────────────────────

  const startTracking = useCallback((sessionId: number) => {
    diag('startTracking', {
      sessionId,
      platform: isNative() ? 'native' : 'web',
      nativeBridgeDetected: typeof window !== 'undefined' && !!window.Capacitor,
      geolocationAvailable: typeof navigator !== 'undefined' && 'geolocation' in navigator,
    });

    // Send initial heartbeat immediately (even before GPS fix)
    void sendHeartbeat(sessionId, permStatusRef.current, gpsStatusRef.current);

    // Attempt an immediate GPS push
    void pushGpsNow();

    // GPS push interval (supplements watchPosition for reliability)
    if (!gpsIntervalRef.current) {
      gpsIntervalRef.current = setInterval(() => void pushGpsNow(), GPS_PUSH_INTERVAL_MS);
    }

    // Heartbeat interval
    if (!heartbeatIntervalRef.current) {
      heartbeatIntervalRef.current = setInterval(
        () => void sendHeartbeat(sessionId, permStatusRef.current, gpsStatusRef.current),
        HEARTBEAT_INTERVAL_MS,
      );
    }

    // Start continuous watchPosition for faster updates
    if (isNative()) {
      startNativeWatch(sessionId);
    } else {
      startWebWatch(sessionId);
    }
  }, [sendHeartbeat, pushGpsNow, startNativeWatch, startWebWatch]);

  // ── Stop tracking ────────────────────────────────────────────────────────────

  const stopTracking = useCallback(() => {
    diag('stopTracking');
    stopWatchers();
    stopIntervals();
    setGpsStatusBoth('waiting_permission');
    lastAcceptedRef.current = null;
  }, [stopWatchers, stopIntervals]);

  // ── Session refresh ──────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet/driver-sessions/active', { credentials: 'include' });
      if (res.status === 401) {
        if (mountedRef.current) setSession(null);
        return;
      }
      const data = await res.json() as { session?: DriverSession | null };
      if (mountedRef.current) setSession(data.session ?? null);
    } catch {
      if (mountedRef.current) setError('Failed to load driving session');
    }
  }, []);

  // ── Stop session ─────────────────────────────────────────────────────────────

  const stopSession = useCallback(async (sessionId: number) => {
    await fetch(`/api/fleet/driver-sessions/${sessionId}/stop`, {
      method: 'POST',
      credentials: 'include',
    });
    if (mountedRef.current) setSession(null);
    sessionIdRef.current = null;
  }, []);

  // ── reportGpsState (called by DriverGpsStatus) ───────────────────────────────

  const reportGpsState = useCallback((
    permStatus: GpsPermissionStatus,
    gpsStatusVal: GpsStatusValue,
  ) => {
    permStatusRef.current = permStatus;
    setGpsStatusBoth(gpsStatusVal);
    const sid = sessionIdRef.current;
    if (sid != null) {
      void sendHeartbeat(sid, permStatus, gpsStatusVal);
    }
  }, [sendHeartbeat]);

  // ── React to session changes ─────────────────────────────────────────────────

  useEffect(() => {
    if (!session?.id) {
      // Session ended or not loaded yet — stop everything
      if (sessionIdRef.current !== null) {
        diag('session ended — stopping tracking', { previousSessionId: sessionIdRef.current });
        stopTracking();
        sessionIdRef.current = null;
      }
      return;
    }

    const sessionId = session.id;

    if (sessionIdRef.current === sessionId) {
      // Same session — tracking already running, nothing to do
      return;
    }

    // New session started
    diag('new session detected — starting tracking', { sessionId });
    sessionIdRef.current = sessionId;
    startTracking(sessionId);

    return () => {
      // This cleanup only runs when the effect re-runs (session id changed),
      // NOT on navigation. The provider stays mounted.
    };
  }, [session?.id, startTracking, stopTracking]);

  // ── Stale detection ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!session?.id) return;
    const t = setInterval(() => {
      if (
        lastAcceptedRef.current !== null &&
        gpsStatusRef.current === 'live' &&
        Date.now() - lastAcceptedRef.current > STALE_THRESHOLD_MS
      ) {
        diag('GPS point is stale');
        setGpsStatusBoth('stale');
        void sendHeartbeat(session.id, permStatusRef.current, 'stale');
      }
    }, 30_000);
    return () => clearInterval(t);
  }, [session?.id, sendHeartbeat]);

  // ── Capacitor foreground/background listener ─────────────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cap = window.Capacitor;
    if (!cap?.Plugins?.App) return;

    const App = cap.Plugins.App as {
      addListener: (event: string, cb: (state: { isActive: boolean }) => void) => Promise<{ remove: () => void }> | { remove: () => void };
    };

    // Guard: addListener must be a function. On some Capacitor versions the
    // plugin stub is registered before the bridge is fully initialised, so
    // Plugins.App is truthy but its methods are not yet callable.
    if (typeof App.addListener !== 'function') return;

    let removeListener: (() => void) | null = null;

    const result = App.addListener('appStateChange', (state) => {
      diag('appStateChange', { isActive: state.isActive });
      if (state.isActive && sessionIdRef.current !== null) {
        // Returned to foreground with an active session
        diag('foreground — refreshing session and restarting watcher');
        void refresh();
        // Restart watcher if it was cleared by the OS
        if (!watchActiveRef.current) {
          if (isNative()) {
            startNativeWatch(sessionIdRef.current);
          } else {
            startWebWatch(sessionIdRef.current);
          }
        }
        // Immediate GPS push
        void pushGpsNow();
      } else if (!state.isActive) {
        // Entering background — do NOT claim tracking is live
        diag('background — foreground-only tracking paused');
        // We do NOT stop the watcher here; the OS will suspend it.
        // The stale detection above will catch the gap when we return.
      }
    });

    // addListener returns Promise<{remove}> on Capacitor 4+, or {remove} directly on older builds
    if (result && typeof (result as Promise<{ remove: () => void }>).then === 'function') {
      (result as Promise<{ remove: () => void }>)
        .then((handle) => { removeListener = handle.remove.bind(handle); })
        .catch(() => undefined);
    } else {
      const handle = result as { remove: () => void };
      if (typeof handle?.remove === 'function') {
        removeListener = handle.remove.bind(handle);
      }
    }

    return () => { removeListener?.(); };
  }, [refresh, startNativeWatch, startWebWatch, pushGpsNow]);

  // ── Session poll ─────────────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const interval = setInterval(refresh, 30_000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      stopTracking();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: DriverSessionContextValue = {
    session,
    error,
    gpsStatus,
    refresh,
    stopSession,
    reportGpsState,
  };

  // ── Debug snapshot for bug report diagnostics ────────────────────────────────
  // Exposed on window so BugReportModal can read GPS state without prop-drilling.
  // Safe: never includes coordinates. Updated on every render.
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__driverSessionDebug = {
      session_id:         sessionIdRef.current,
      gps_status:         gpsStatusRef.current,
      permission_status:  permStatusRef.current,
      last_telemetry_at:  lastAcceptedRef.current
        ? new Date(lastAcceptedRef.current).toISOString()
        : null,
      is_tracking:        watchActiveRef.current ?? false,
    };
  }

  return (
    <DriverSessionContext.Provider value={value}>
      {children}
    </DriverSessionContext.Provider>
  );
}
