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
} from 'lucide-react';
import { getNativeGeo, isNative } from '@/lib/capacitor-plugins';

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

export default function DriverGpsStatus({ onPosition, variant = 'card', active = true }: DriverGpsStatusProps) {
  const [state, setState] = useState<GpsState>('waiting');
  const [reading, setReading] = useState<GpsReading | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [tick, setTick] = useState(0); // forces re-render for timeAgo
  const watchIdRef = useRef<number | string | null>(null);
  const nativeWatchRef = useRef<(() => void) | null>(null);

  // Tick every 5s to update "X seconds ago" label
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const handlePosition = useCallback((pos: { coords: {
    latitude: number; longitude: number; accuracy: number;
    speed: number | null; heading: number | null; altitude: number | null;
  }; timestamp: number }) => {
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

  useEffect(() => {
    if (!active) {
      setState('waiting');
      return;
    }

    setState('acquiring');

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
    };
  }, [active, handlePosition, handleError]);

  // ── Pill variant ──────────────────────────────────────────────────────────
  if (variant === 'pill') {
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

      {/* Error message */}
      {errorMsg && (
        <div className="px-4 pb-3">
          <p className="text-xs text-red-400">{errorMsg}</p>
        </div>
      )}
    </div>
  );
}
