/**
 * GpsStatusBadge
 * ─────────────────────────────────────────────────────────────────────────────
 * Colour-coded chip that shows a driver's GPS / location permission status
 * on the office Fleet view.
 *
 * Colour semantics:
 *   green  — live GPS fix arriving normally
 *   amber  — waiting (permission not yet granted, or no fix yet)
 *   red    — denied / disabled by user
 *   grey   — unavailable (device has no GPS) or unknown
 *
 * Size variants:
 *   'sm'   — compact chip for DriverCard sidebar rows
 *   'md'   — slightly larger for mobile bottom list
 */
import { Wifi, WifiOff, Crosshair, Clock, AlertTriangle, Loader2 } from 'lucide-react';

export type LocationPermissionStatus =
  | 'granted' | 'prompt' | 'denied' | 'unavailable' | 'unknown' | null | undefined;

export type GpsStatusValue =
  | 'live' | 'waiting_permission' | 'denied' | 'unavailable' | 'waiting_fix' | 'stale'
  | null | undefined;

interface GpsStatusBadgeProps {
  locationPermissionStatus: LocationPermissionStatus;
  gpsStatus: GpsStatusValue;
  lastSeenAt?: string | null;
  size?: 'sm' | 'md';
}

interface BadgeConfig {
  label: string;
  icon: React.ElementType;
  iconClass: string;
  chipClass: string;
  pulse?: boolean;
}

function resolveConfig(
  permStatus: LocationPermissionStatus,
  gpsStatus: GpsStatusValue,
  lastSeenAt: string | null | undefined,
): BadgeConfig {
  // ── Stale: has a last_seen_at but it's old (> 5 min) ──────────────────────
  if (gpsStatus === 'stale' || (
    lastSeenAt &&
    gpsStatus !== 'denied' &&
    gpsStatus !== 'unavailable' &&
    gpsStatus !== 'waiting_permission' &&
    Date.now() - new Date(lastSeenAt).getTime() > 5 * 60_000
  )) {
    return {
      label: 'GPS signal stale',
      icon: Clock,
      iconClass: 'text-amber-500',
      chipClass: 'bg-amber-50 border-amber-200 text-amber-700',
    };
  }

  // ── Live GPS ───────────────────────────────────────────────────────────────
  if (gpsStatus === 'live' || (permStatus === 'granted' && lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < 5 * 60_000)) {
    return {
      label: 'Live GPS',
      icon: Wifi,
      iconClass: 'text-emerald-500',
      chipClass: 'bg-emerald-50 border-emerald-200 text-emerald-700',
      pulse: true,
    };
  }

  // ── Denied ────────────────────────────────────────────────────────────────
  if (gpsStatus === 'denied' || permStatus === 'denied') {
    return {
      label: 'Location disabled by user',
      icon: WifiOff,
      iconClass: 'text-red-500',
      chipClass: 'bg-red-50 border-red-200 text-red-700',
    };
  }

  // ── Unavailable ───────────────────────────────────────────────────────────
  if (gpsStatus === 'unavailable' || permStatus === 'unavailable') {
    return {
      label: 'GPS unavailable on device',
      icon: WifiOff,
      iconClass: 'text-slate-400',
      chipClass: 'bg-slate-100 border-slate-200 text-slate-500',
    };
  }

  // ── Waiting for permission ─────────────────────────────────────────────────
  if (gpsStatus === 'waiting_permission' || permStatus === 'prompt') {
    return {
      label: 'Waiting for location permission',
      icon: AlertTriangle,
      iconClass: 'text-amber-500',
      chipClass: 'bg-amber-50 border-amber-200 text-amber-700',
      pulse: true,
    };
  }

  // ── Waiting for GPS fix ───────────────────────────────────────────────────
  if (gpsStatus === 'waiting_fix') {
    return {
      label: 'Waiting for GPS fix',
      icon: Crosshair,
      iconClass: 'text-amber-500',
      chipClass: 'bg-amber-50 border-amber-200 text-amber-700',
      pulse: true,
    };
  }

  // ── No heartbeat yet / unknown ────────────────────────────────────────────
  return {
    label: 'No GPS yet',
    icon: Loader2,
    iconClass: 'text-slate-400',
    chipClass: 'bg-slate-100 border-slate-200 text-slate-500',
    pulse: true,
  };
}

export default function GpsStatusBadge({
  locationPermissionStatus,
  gpsStatus,
  lastSeenAt,
  size = 'sm',
}: GpsStatusBadgeProps) {
  const cfg = resolveConfig(locationPermissionStatus, gpsStatus, lastSeenAt);
  const Icon = cfg.icon;

  const iconSize = size === 'sm' ? 9 : 11;
  const textClass = size === 'sm' ? 'text-[10px]' : 'text-[11px]';
  const padClass  = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-semibold ${padClass} ${textClass} ${cfg.chipClass}`}
      title={cfg.label}
    >
      <Icon
        size={iconSize}
        className={`${cfg.iconClass} ${cfg.pulse ? 'animate-pulse' : ''} shrink-0`}
      />
      <span className="truncate max-w-[140px]">{cfg.label}</span>
    </span>
  );
}
