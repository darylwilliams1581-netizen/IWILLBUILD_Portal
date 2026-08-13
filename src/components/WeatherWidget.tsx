/**
 * WeatherWidget — compact GPS-based weather pill for the dashboard header.
 *
 * Variants:
 *   desktop  — slightly wider, shows full condition text
 *   mobile   — compact, fits in the top-right of the dark mobile header
 *
 * States:
 *   idle        → "Enable weather" button
 *   requesting  → spinner
 *   success     → icon + temp + condition
 *   denied      → "Location off" + Retry
 *   unavailable → "Location off" + Retry
 *   error       → "Weather unavailable" + Retry
 *
 * NOTE: This component is always rendered on a dark purple/near-black header
 * surface (same as DesktopTopBar and the mobile home header). The inline
 * styles below use the same white-alpha overlay pattern as DesktopTopBar.tsx
 * which also lives on that fixed dark gradient — they are surface-relative
 * overlays, not brand palette overrides.
 */

import React, { useEffect } from 'react';
import {
  Sun, Cloud, CloudRain, CloudSnow, CloudLightning,
  CloudDrizzle, Thermometer, Loader2, MapPin, RefreshCw,
} from 'lucide-react';
import { useWeatherWidget, type WeatherIcon } from '@/hooks/useWeatherWidget';

// ── Icon map ──────────────────────────────────────────────────────────────────

const ICON_MAP: Record<WeatherIcon, React.ElementType> = {
  Sun:             Sun,
  Cloud:           Cloud,
  CloudRain:       CloudRain,
  CloudSnow:       CloudSnow,
  CloudLightning:  CloudLightning,
  CloudDrizzle:    CloudDrizzle,
  CloudFog:        Cloud,
  Wind:            Cloud,
  Thermometer:     Thermometer,
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface WeatherWidgetProps {
  /** 'desktop' — slightly wider pill; 'mobile' — compact for dark header */
  variant?: 'desktop' | 'mobile';
}

// ── Shared class helpers ──────────────────────────────────────────────────────
// All classes target the dark header surface (same as DesktopTopBar pill links).

const PILL_CLS =
  'inline-flex items-center gap-1 rounded-full text-white/90 font-semibold whitespace-nowrap flex-shrink-0 select-none ' +
  'border border-white/15 bg-white/10';

const BTN_CLS =
  PILL_CLS +
  ' cursor-pointer transition-colors hover:bg-white/20 active:bg-white/25';

// ── Component ─────────────────────────────────────────────────────────────────

export default function WeatherWidget({ variant = 'desktop' }: WeatherWidgetProps) {
  const { state, requestWeather, retry } = useWeatherWidget();
  const isMobile = variant === 'mobile';

  const sizeClass = isMobile ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1 text-[12px]';
  const iconSize  = isMobile ? 12 : 13;

  // Auto-serve from cache on mount (no permission prompt)
  useEffect(() => {
    void requestWeather();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Idle: "Enable weather" ────────────────────────────────────────────────────

  if (state.status === 'idle') {
    return (
      <button
        onClick={() => void requestWeather()}
        className={`${BTN_CLS} ${sizeClass}`}
        title="Enable weather"
        aria-label="Enable weather"
      >
        <Sun size={iconSize} strokeWidth={2} />
        <span>{isMobile ? 'Weather' : 'Enable weather'}</span>
      </button>
    );
  }

  // ── Requesting: spinner ───────────────────────────────────────────────────────

  if (state.status === 'requesting') {
    return (
      <span className={`${PILL_CLS} ${sizeClass}`} aria-label="Loading weather…">
        <Loader2 size={iconSize} strokeWidth={2} className="animate-spin" />
        {!isMobile && <span>Loading…</span>}
      </span>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────────

  if (state.status === 'success') {
    const IconComp = ICON_MAP[state.icon];
    return (
      <button
        onClick={() => void retry()}
        className={`${BTN_CLS} ${sizeClass}`}
        title="Refresh weather"
        aria-label={`Weather: ${state.temp}°C, ${state.condition}. Tap to refresh.`}
      >
        <IconComp size={isMobile ? 13 : 14} strokeWidth={2} />
        <span>{state.temp}°</span>
        {!isMobile && (
          <span className="text-white/60 font-medium">{state.condition}</span>
        )}
      </button>
    );
  }

  // ── Denied / Unavailable ──────────────────────────────────────────────────────

  if (state.status === 'denied' || state.status === 'unavailable') {
    return (
      <button
        onClick={() => void retry()}
        className={`${BTN_CLS} ${sizeClass} text-white/45`}
        title="Location unavailable — tap to retry"
        aria-label="Location off. Tap to retry."
      >
        <MapPin size={isMobile ? 11 : 12} strokeWidth={2} />
        <span>{isMobile ? 'Off' : 'Location off'}</span>
        <RefreshCw size={isMobile ? 10 : 11} strokeWidth={2} />
      </button>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────

  return (
    <button
      onClick={() => void retry()}
      className={`${BTN_CLS} ${sizeClass} text-white/45`}
      title="Weather unavailable — tap to retry"
      aria-label="Weather unavailable. Tap to retry."
    >
      <Thermometer size={isMobile ? 11 : 12} strokeWidth={2} />
      {!isMobile && <span>Unavailable</span>}
      <RefreshCw size={isMobile ? 10 : 11} strokeWidth={2} />
    </button>
  );
}
