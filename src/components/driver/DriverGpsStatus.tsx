/**
 * DriverGpsStatus
 * ─────────────────────────────────────────────────────────────────────────────
 * Live GPS signal indicator for the driver app view.
 * Shows: fix status, accuracy radius, current speed, heading, last update time.
 * Reads from the browser/native geolocation API directly — no server round-trip.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Navigation,
  Wifi,
  WifiOff,
  Gauge,
  Crosshair,
  Clock,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { getNativeGeo, isNative } from '@/lib/capacitor-plugins';
import { useGpsPermission } from '@/lib/useGpsPermission';
import type { GpsStatusValue } from '@/lib/useDriverSession';

export interface GpsReading {
  lat: number;
  lng: number;
  accuracy: number;       // metres
  speed: number | null;   // m/s from browser, converted to km/h
  heading: number | null; // degrees 0–360
  altitude: number | null;
  timestamp: number;
}

interface DriverGpsStatusProps {
  /** Called whenever a new GPS fix arrives */
  onPosition?: (pos: GpsReading) => void;
  /**
   * Called whenever the local permission or GPS state changes.
   * Used by useDriverSession to send heartbeats to the server so the
   * office Fleet view can show the correct status.
   */
  onStateChange?: (permStatus: import('@/lib/useGpsPermission').GpsPermissionStatus, gpsStatus: GpsStatusValue) => void;
  /** Show the full expanded card (default) or a compact pill */
  variant?: 'card' | 'pill';
  /** Whether GPS tracking is currently expected (session active) */
  active?: boolean;
}

type GpsState = 'waiting' | 'acquiring' | 'good' | 'poor' | 'error' | 'denied';

function accuracyLabel(acc: number): { label: string; state: GpsState } {
  if (acc <= 10)  return { label: 'Excellent', state: 'good' };
  if (acc <= 30)  return { label: 'Good',      state: 'good' };
  if (acc <= 100) return { label: 'Fair',       state: 'poor' };
  return           { label: 'Poor',             state: 'poor' };
}

function headingLabel(deg: number | null): string {
  if (deg === null) return '—';
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function timeAgo(ts: number): string {
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 5)  return 'just now';
  if (sec < 60) return `${sec}s ago`;
  return `${Math.round(sec / 60)}m ago`;
}

export default function DriverGpsStatus({ onPosition, onStateChange, variant = 'card', active = true }: DriverGpsStatusProps) {
  const { status: permStatus, request: requestPerm, openSettings } = useGpsPermission();

  const [state, setState] = useState<GpsState>('waiting');
  const [reading, setReading] = useState<GpsReading | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [tick, setTick] = useState(0); // forces re-render for timeAgo
  const [requesting, setRequesting] = useState(false);
  // Tracks whether we've been stuck in 'acquiring' for too long
  const [acquiringTimedOut, setAcquiringTimedOut] = useState(false);
  const watchIdRef = useRef<number | string | null>(null);
  const nativeWatchRef = useRef<(() => void) | null>(null);
  const acquiringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tick every 5s to update "X seconds ago" label
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  // ── Report permission + GPS state to parent (useDriverSession heartbeat) ──
  useEffect(() => {
    if (!onStateChange) return;
    // Map local GpsState → GpsStatusValue for the server
    const gpsStatusMap: Record<GpsState, GpsStatusValue> = {
      waiting:   'waiting_fix',
      acquiring: 'waiting_fix',
      good:      'live',
      poor:      'live',
      error:     'unavailable',
      denied:    'denied',
    };
    // Map permission status → GpsStatusValue override when no fix possible
    let gpsStatus: GpsStatusValue = gpsStatusMap[state];
    if (permStatus === 'denied')      gpsStatus = 'denied';
    if (permStatus === 'unavailable') gpsStatus = 'unavailable';
    if (permStatus === 'prompt' || permStatus === 'unknown') gpsStatus = 'waiting_permission';
    onStateChange(permStatus, gpsStatus);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permStatus, state]);

  const handlePosition = useCallback((pos: { coords: {
    latitude: number; longitude: number; accuracy: number;
    speed: number | null; heading: number | null; altitude: number | null;
  }; timestamp: number }) => {
    // Clear acquiring timeout — we got a fix
    if (acquiringTimerRef.current) {
      clearTimeout(acquiringTimerRef.current);
      acquiringTimerRef.current = null;
    }
    setAcquiringTimedOut(false);
    const r: GpsReading = {
      lat:      pos.coords.latitude,
      lng:      pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      speed:    pos.coords.speed != null ? pos.coords.speed * 3.6 : null, // m/s → km/h
      heading:  pos.coords.heading,
      altitude: pos.coords.altitude,
      timestamp: pos.timestamp,
    };
    setReading(r);
    setState(r.accuracy <= 100 ? 'good' : 'poor');
    setErrorMsg('');
    onPosition?.(r);
  }, [onPosition]);

  const handleError = useCallback((err: { code: number; message: string }) => {
    if (acquiringTimerRef.current) {
      clearTimeout(acquiringTimerRef.current);
      acquiringTimerRef.current = null;
    }
    if (err.code === 1) {
      setState('denied');
      setErrorMsg('Location permission denied. Enable in device settings.');
    } else if (err.code === 2) {
      setState('error');
      setErrorMsg('GPS signal unavailable. Move to an open area.');
    } else {
      setState('error');
      setErrorMsg('GPS timed out. Retrying…');
    }
  }, []);

  // ── Start watching only when permission is granted ────────────────────────
  useEffect(() => {
    if (!active || permStatus !== 'granted') {
      // Not active or permission not yet granted — stop any existing watch
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current as number);
        watchIdRef.current = null;
      }
      nativeWatchRef.current?.();
      nativeWatchRef.current = null;
      if (acquiringTimerRef.current) {
        clearTimeout(acquiringTimerRef.current);
        acquiringTimerRef.current = null;
      }
      if (!active) setState('waiting');
      return;
    }

    setState('acquiring');
    setAcquiringTimedOut(false);

    // 20s acquiring timeout — if no fix arrives, show a retry path
    acquiringTimerRef.current = setTimeout(() => {
      // Only fire if still in acquiring state (no fix yet)
      setState(prev => {
        if (prev === 'acquiring') {
          setAcquiringTimedOut(true);
          setErrorMsg('No GPS fix after 20s. Move to an open area or check device settings.');
          return 'error';
        }
        return prev;
      });
    }, 20_000);

    // Try native Capacitor GPS first (Android/iOS shell)
    if (isNative()) {
      getNativeGeo().then((geo) => {
        if (!geo) return startBrowserWatch();

        geo.watchPosition(
          { enableHighAccuracy: true, timeout: 15_000 },
          (pos, err) => {
            if (err || !pos) {
              handleError({ code: err?.code ?? 2, message: err?.message ?? '' });
              return;
            }
            handlePosition({
              coords: {
                latitude:  pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy:  pos.coords.accuracy,
                speed:     pos.coords.speed ?? null,
                heading:   pos.coords.heading ?? null,
                altitude:  pos.coords.altitude ?? null,
              },
              timestamp: pos.timestamp,
            });
          }
        ).then((watchId) => {
          nativeWatchRef.current = () => void geo.clearWatch({ id: watchId });
        }).catch(() => startBrowserWatch());
      }).catch(() => startBrowserWatch());
    } else {
      startBrowserWatch();
    }

    function startBrowserWatch() {
      if (!navigator.geolocation) {
        setState('error');
        setErrorMsg('Geolocation not supported on this device.');
        return;
      }
      watchIdRef.current = navigator.geolocation.watchPosition(
        handlePosition,
        handleError,
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 }
      );
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current as number);
        watchIdRef.current = null;
      }
      nativeWatchRef.current?.();
      nativeWatchRef.current = null;
      if (acquiringTimerRef.current) {
        clearTimeout(acquiringTimerRef.current);
        acquiringTimerRef.current = null;
      }
    };
  }, [active, permStatus, handlePosition, handleError]);

  // ── Handle "Enable Location" tap ──────────────────────────────────────────
  async function handleEnableLocation() {
    setRequesting(true);
    await requestPerm();
    setRequesting(false);
  }

  // ── Retry GPS (after timeout or error) ───────────────────────────────────
  function handleRetryGps() {
    setAcquiringTimedOut(false);
    setErrorMsg('');
    setState('acquiring');
    // Stop existing watch so the useEffect re-runs cleanly
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current as number);
      watchIdRef.current = null;
    }
    nativeWatchRef.current?.();
    nativeWatchRef.current = null;
    // Re-trigger the watch effect by briefly toggling — use a direct call instead
    // to avoid a React state cycle. Start a fresh watch immediately.
    if (acquiringTimerRef.current) {
      clearTimeout(acquiringTimerRef.current);
    }
    acquiringTimerRef.current = setTimeout(() => {
      setState(prev => {
        if (prev === 'acquiring') {
          setAcquiringTimedOut(true);
          setErrorMsg('Still no GPS fix. Move to an open area.');
          return 'error';
        }
        return prev;
      });
    }, 20_000);

    if (isNative()) {
      getNativeGeo().then((geo) => {
        if (!geo) {
          startFreshBrowserWatch();
          return;
        }
        geo.watchPosition(
          { enableHighAccuracy: true, timeout: 15_000 },
          (pos, err) => {
            if (err || !pos) { handleError({ code: err?.code ?? 2, message: err?.message ?? '' }); return; }
            handlePosition({
              coords: {
                latitude: pos.coords.latitude, longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy, speed: pos.coords.speed ?? null,
                heading: pos.coords.heading ?? null, altitude: pos.coords.altitude ?? null,
              },
              timestamp: pos.timestamp,
            });
          }
        ).then((watchId) => {
          nativeWatchRef.current = () => void geo.clearWatch({ id: watchId });
        }).catch(() => startFreshBrowserWatch());
      }).catch(() => startFreshBrowserWatch());
    } else {
      startFreshBrowserWatch();
    }

    function startFreshBrowserWatch() {
      if (!navigator.geolocation) { setState('error'); setErrorMsg('Geolocation not supported.'); return; }
      watchIdRef.current = navigator.geolocation.watchPosition(
        handlePosition, handleError,
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 }
      );
    }
  }

  // ── Pill variant ──────────────────────────────────────────────────────────
  if (variant === 'pill') {
    // Permission not yet granted — show a compact "Enable" pill
    if (active && (permStatus === 'prompt' || permStatus === 'checking' || permStatus === 'unknown')) {
      return (
        <button
          onClick={() => void handleEnableLocation()}
          disabled={requesting || permStatus === 'checking'}
          className="inline-flex items-center gap-1.5 bg-amber-500 rounded-full px-3 py-1.5 border border-amber-400 active:bg-amber-600 transition-colors"
        >
          {requesting ? <Loader2 size={11} className="animate-spin text-white" /> : <MapPin size={11} className="text-white" />}
          <span className="text-xs text-white font-semibold">Enable Location</span>
        </button>
      );
    }
    if (active && permStatus === 'denied') {
      return (
        <button
          onClick={() => void openSettings()}
          className="inline-flex items-center gap-1.5 bg-red-900/60 rounded-full px-3 py-1.5 border border-red-700 active:bg-red-800 transition-colors"
        >
          <WifiOff size={11} className="text-red-400" />
          <span className="text-xs text-red-300 font-semibold">Location denied — Settings</span>
          <ExternalLink size={9} className="text-red-400" />
        </button>
      );
    }
    const dotColor = state === 'good' ? 'bg-emerald-400' : state === 'poor' ? 'bg-amber-400' : state === 'acquiring' ? 'bg-blue-400' : 'bg-red-400';
    const label = state === 'good' ? `±${Math.round(reading?.accuracy ?? 0)}m` : state === 'acquiring' ? 'Acquiring…' : state === 'denied' ? 'Denied' : state === 'waiting' ? 'GPS off' : 'No signal';
    return (
      <div className="inline-flex items-center gap-1.5 bg-gray-800 rounded-full px-3 py-1.5 border border-gray-700">
        <span className={`w-2 h-2 rounded-full ${dotColor} ${state === 'acquiring' ? 'animate-pulse' : ''}`} />
        <Navigation size={11} className="text-gray-400" />
        <span className="text-xs text-gray-300 font-medium">{label}</span>
        {reading?.speed != null && reading.speed > 1 && (
          <span className="text-xs text-gray-500">{Math.round(reading.speed)} km/h</span>
        )}
      </div>
    );
  }

  // ── Card variant ──────────────────────────────────────────────────────────

  // Permission not yet requested — show "Enable Location" card
  if (active && (permStatus === 'prompt' || permStatus === 'unknown')) {
    return (
      <div className="rounded-2xl border border-amber-800/50 bg-amber-950/40 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
            <MapPin size={18} className="text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-300">Location access needed</p>
            <p className="text-xs text-amber-500 mt-0.5 leading-snug">
              GPS tracking requires location permission to record your drive.
            </p>
          </div>
        </div>
        <div className="px-4 pb-4">
          <button
            onClick={() => void handleEnableLocation()}
            disabled={requesting}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-60"
          >
            {requesting ? <Loader2 size={15} className="animate-spin" /> : <MapPin size={15} />}
            {requesting ? 'Requesting…' : 'Enable Location'}
          </button>
        </div>
      </div>
    );
  }

  // Permission checking — show brief spinner with 5s escape to 'prompt'
  // (useGpsPermission handles the timeout internally via its own effect, but
  //  we add a UI-level escape so the card never stays stuck permanently)
  if (permStatus === 'checking') {
    return (
      <div className="rounded-2xl border border-gray-700 bg-gray-800 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-4">
          <Loader2 size={18} className="text-gray-400 animate-spin shrink-0" />
          <p className="text-xs text-gray-400">Checking location permission…</p>
        </div>
      </div>
    );
  }

  // Permission denied — show Settings link
  if (active && permStatus === 'denied') {
    return (
      <div className="rounded-2xl border border-red-800/50 bg-red-950/40 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center shrink-0">
            <WifiOff size={18} className="text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-300">Location access denied</p>
            <p className="text-xs text-red-400 mt-0.5 leading-snug">
              GPS tracking is disabled. Enable location for this app in your device Settings.
            </p>
          </div>
        </div>
        {isNative() && (
          <div className="px-4 pb-4">
            <button
              onClick={() => void openSettings()}
              className="w-full flex items-center justify-center gap-2 bg-red-800/60 hover:bg-red-700/60 active:bg-red-900/60 text-red-200 font-semibold py-3 rounded-xl transition-colors border border-red-700/50"
            >
              <ExternalLink size={14} />
              Open Settings
            </button>
          </div>
        )}
      </div>
    );
  }

  const accInfo = reading ? accuracyLabel(reading.accuracy) : null;

  const stateConfig = {
    waiting:    { icon: WifiOff,      color: 'text-gray-500',   bg: 'bg-gray-800',         border: 'border-gray-700',   label: 'GPS Inactive' },
    acquiring:  { icon: Crosshair,    color: 'text-blue-400',   bg: 'bg-blue-950/40',      border: 'border-blue-800/50', label: 'Acquiring signal…' },
    good:       { icon: CheckCircle2, color: 'text-emerald-400',bg: 'bg-emerald-950/40',   border: 'border-emerald-800/50', label: 'GPS Active' },
    poor:       { icon: AlertTriangle,color: 'text-amber-400',  bg: 'bg-amber-950/40',     border: 'border-amber-800/50', label: 'Weak Signal' },
    error:      { icon: WifiOff,      color: 'text-red-400',    bg: 'bg-red-950/40',       border: 'border-red-800/50',  label: 'GPS Error' },
    denied:     { icon: WifiOff,      color: 'text-red-400',    bg: 'bg-red-950/40',       border: 'border-red-800/50',  label: 'Permission Denied' },
  }[state];

  const Icon = stateConfig.icon;

  return (
    <div className={`rounded-2xl border ${stateConfig.bg} ${stateConfig.border} overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon size={15} className={`${stateConfig.color} ${state === 'acquiring' ? 'animate-pulse' : ''}`} />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">GPS</span>
          <span className={`text-xs font-semibold ${stateConfig.color}`}>{stateConfig.label}</span>
        </div>
        {reading && (
          <div className="flex items-center gap-1 text-gray-600">
            <Clock size={10} />
            <span className="text-xs">{timeAgo(reading.timestamp)}</span>
            {/* suppress unused tick warning */}
            <span className="sr-only">{tick}</span>
          </div>
        )}
      </div>

      {/* Stats row */}
      <AnimatePresence>
        {reading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-white/5"
          >
            <div className="grid grid-cols-3 divide-x divide-white/5">
              {/* Accuracy */}
              <div className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <Wifi size={11} className={accInfo?.state === 'good' ? 'text-emerald-400' : 'text-amber-400'} />
                </div>
                <p className="text-white font-bold text-sm">±{Math.round(reading.accuracy)}m</p>
                <p className="text-gray-500 text-xs">{accInfo?.label}</p>
              </div>

              {/* Speed */}
              <div className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <Gauge size={11} className="text-gray-500" />
                </div>
                <p className="text-white font-bold text-sm">
                  {reading.speed != null ? `${Math.round(reading.speed)}` : '—'}
                </p>
                <p className="text-gray-500 text-xs">km/h</p>
              </div>

              {/* Heading */}
              <div className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <Navigation size={11} className="text-gray-500" />
                </div>
                <p className="text-white font-bold text-sm">{headingLabel(reading.heading)}</p>
                <p className="text-gray-500 text-xs">
                  {reading.heading != null ? `${Math.round(reading.heading)}°` : 'Heading'}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error message + retry button */}
      {errorMsg && (
        <div className="px-4 pb-3 space-y-2">
          <p className="text-xs text-red-400">{errorMsg}</p>
          {(state === 'error' || acquiringTimedOut) && (
            <button
              onClick={handleRetryGps}
              className="flex items-center gap-1.5 text-xs text-blue-400 font-semibold hover:text-blue-300 transition-colors"
            >
              <Crosshair size={11} />
              Retry GPS
            </button>
          )}
        </div>
      )}
    </div>
  );
}
