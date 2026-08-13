/**
 * useWeatherWidget — GPS-based weather via Open-Meteo (no API key required).
 *
 * Location strategy (in priority order):
 *   1. Capacitor Geolocation (iOS/Android native)
 *   2. browser navigator.geolocation
 *
 * Privacy rules:
 *   - Coordinates are never sent to IWILLBUILD servers.
 *   - Coordinates are never stored in any database.
 *   - Only used to call Open-Meteo and then discarded.
 *   - Weather result is cached in memory for CACHE_MS (20 min).
 *
 * State machine:
 *   idle → requesting → success
 *                    → denied
 *                    → unavailable
 *                    → error
 */

import { useState, useCallback, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type WeatherState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'success'; temp: number; condition: string; icon: WeatherIcon }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

export type WeatherIcon =
  | 'Sun'
  | 'Cloud'
  | 'CloudRain'
  | 'CloudSnow'
  | 'CloudLightning'
  | 'CloudDrizzle'
  | 'CloudFog'
  | 'Wind'
  | 'Thermometer';

// ── WMO code → (condition, icon) ─────────────────────────────────────────────
// https://open-meteo.com/en/docs#weathervariables

function decodeWmo(code: number): { condition: string; icon: WeatherIcon } {
  if (code === 0)                        return { condition: 'Clear',        icon: 'Sun' };
  if (code === 1)                        return { condition: 'Mostly clear',  icon: 'Sun' };
  if (code === 2)                        return { condition: 'Partly cloudy', icon: 'Cloud' };
  if (code === 3)                        return { condition: 'Overcast',      icon: 'Cloud' };
  if (code >= 45 && code <= 48)          return { condition: 'Foggy',         icon: 'CloudFog' };
  if (code >= 51 && code <= 57)          return { condition: 'Drizzle',       icon: 'CloudDrizzle' };
  if (code >= 61 && code <= 67)          return { condition: 'Rain',          icon: 'CloudRain' };
  if (code >= 71 && code <= 77)          return { condition: 'Snow',          icon: 'CloudSnow' };
  if (code >= 80 && code <= 82)          return { condition: 'Showers',       icon: 'CloudRain' };
  if (code === 85 || code === 86)        return { condition: 'Snow showers',  icon: 'CloudSnow' };
  if (code >= 95 && code <= 99)          return { condition: 'Thunderstorm',  icon: 'CloudLightning' };
  return { condition: 'Unknown', icon: 'Thermometer' };
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_MS = 20 * 60 * 1000; // 20 minutes

interface CacheEntry {
  ts: number;
  temp: number;
  condition: string;
  icon: WeatherIcon;
}

let cache: CacheEntry | null = null;

function getCached(): CacheEntry | null {
  if (!cache) return null;
  if (Date.now() - cache.ts > CACHE_MS) { cache = null; return null; }
  return cache;
}

// ── Geolocation helpers ───────────────────────────────────────────────────────

interface Coords { latitude: number; longitude: number; }

async function getCoords(): Promise<Coords> {
  // Try Capacitor first (iOS/Android native)
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 8000,
    });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch {
    // Capacitor not available or permission denied — fall through to browser API
  }

  // Browser geolocation
  return new Promise<Coords>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      err => {
        if (err.code === err.PERMISSION_DENIED) reject(new Error('denied'));
        else if (err.code === err.POSITION_UNAVAILABLE) reject(new Error('unavailable'));
        else reject(new Error('timeout'));
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: CACHE_MS },
    );
  });
}

// ── Open-Meteo fetch ──────────────────────────────────────────────────────────

async function fetchWeather(coords: Coords): Promise<{ temp: number; condition: string; icon: WeatherIcon }> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude.toFixed(4)}&longitude=${coords.longitude.toFixed(4)}&current=temperature_2m,weathercode&temperature_unit=celsius&forecast_days=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const data = await res.json() as {
    current: { temperature_2m: number; weathercode: number };
  };
  const temp = Math.round(data.current.temperature_2m);
  const { condition, icon } = decodeWmo(data.current.weathercode);
  return { temp, condition, icon };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWeatherWidget() {
  const [state, setState] = useState<WeatherState>({ status: 'idle' });
  const inFlight = useRef(false);

  const requestWeather = useCallback(async () => {
    if (inFlight.current) return;

    // Serve from cache if fresh
    const cached = getCached();
    if (cached) {
      setState({ status: 'success', temp: cached.temp, condition: cached.condition, icon: cached.icon });
      return;
    }

    inFlight.current = true;
    setState({ status: 'requesting' });

    try {
      const coords = await getCoords();
      const weather = await fetchWeather(coords);
      cache = { ts: Date.now(), ...weather };
      setState({ status: 'success', ...weather });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'error';
      if (msg === 'denied')      setState({ status: 'denied' });
      else if (msg === 'unavailable') setState({ status: 'unavailable' });
      else setState({ status: 'error', message: msg });
    } finally {
      inFlight.current = false;
    }
  }, []);

  const retry = useCallback(() => {
    cache = null;
    setState({ status: 'idle' });
    void requestWeather();
  }, [requestWeather]);

  return { state, requestWeather, retry };
}
