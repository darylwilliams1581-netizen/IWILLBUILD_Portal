/**
 * useWeatherWidget — GPS-based weather via Open-Meteo (no API key required).
 *
 * Location strategy (in priority order):
 *   1. Capacitor Geolocation — ONLY when running in a real native Capacitor
 *      shell (iOS / Android). Detected via window.Capacitor.isNativePlatform().
 *      The @capacitor/geolocation package is bundled into the JS but the
 *      native bridge is NOT present in Edge, Chrome, Safari, or any web
 *      browser, so we must guard with isNativeCapacitor() before importing.
 *   2. browser navigator.geolocation — used for all web browsers (Edge,
 *      Chrome, Safari, Firefox) and as a fallback inside the Capacitor
 *      WKWebView if the native plugin fails for a non-permission reason.
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

/**
 * Returns true ONLY when running inside a real Capacitor native shell
 * (iOS / Android). The Capacitor bridge object is injected by the native
 * runtime; it is NOT present in Edge, Chrome, Safari, or any plain web
 * browser even though @capacitor/* packages are bundled into the JS.
 */
function isNativeCapacitor(): boolean {
  return (
    typeof window !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    !!(window as any).Capacitor?.isNativePlatform?.()
  );
}

async function getCoordsNative(): Promise<Coords> {
  const { Geolocation } = await import('@capacitor/geolocation');

  // Request permission explicitly first — avoids silent failures on iOS
  // when the app hasn't prompted yet (status = 'prompt').
  try {
    const perm = await Geolocation.requestPermissions();
    const granted = perm.location === 'granted' || perm.coarseLocation === 'granted';
    if (!granted) throw new Error('denied');
  } catch (permErr) {
    // requestPermissions() can itself throw on some Capacitor versions —
    // if it's our sentinel re-throw it; otherwise fall through and let
    // getCurrentPosition surface the real error.
    const msg = permErr instanceof Error ? permErr.message.toLowerCase() : '';
    if (msg === 'denied') throw permErr;
  }

  const pos = await Geolocation.getCurrentPosition({
    enableHighAccuracy: false,
    timeout: 10000,
  });
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
}

function getCoordsWeb(): Promise<Coords> {
  return new Promise<Coords>((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      err => {
        if (err.code === err.PERMISSION_DENIED)         reject(new Error('denied'));
        else if (err.code === err.POSITION_UNAVAILABLE) reject(new Error('unavailable'));
        else                                            reject(new Error('timeout'));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: CACHE_MS },
    );
  });
}

async function getCoords(): Promise<Coords> {
  if (isNativeCapacitor()) {
    try {
      return await getCoordsNative();
    } catch (capErr) {
      const msg = capErr instanceof Error ? capErr.message.toLowerCase() : '';
      // Permission denied — propagate as our sentinel, don't fall through.
      if (
        msg === 'denied' ||
        msg.includes('denied') ||
        msg.includes('notdetermined') ||
        msg.includes('restricted')
      ) {
        throw new Error('denied');
      }
      // Location services off, timeout, or unexpected plugin error —
      // fall through to WKWebView navigator.geolocation as a last resort.
    }
  }

  // Web browsers (Edge, Chrome, Safari, Firefox) and Capacitor WKWebView fallback.
  return getCoordsWeb();
}

// ── Open-Meteo fetch ──────────────────────────────────────────────────────────

async function fetchWeather(coords: Coords): Promise<{ temp: number; condition: string; icon: WeatherIcon }> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${coords.latitude.toFixed(4)}` +
    `&longitude=${coords.longitude.toFixed(4)}` +
    `&current=temperature_2m,weathercode` +
    `&temperature_unit=celsius` +
    `&forecast_days=1`;

  // AbortSignal.timeout() is not available in WKWebView on older iOS versions.
  // Use a manual AbortController + setTimeout instead.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }

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
      const msg = err instanceof Error ? err.message.toLowerCase() : 'error';
      // AbortError comes from our manual AbortController timeout in fetchWeather
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      if (msg === 'denied')                      setState({ status: 'denied' });
      else if (msg === 'unavailable')            setState({ status: 'unavailable' });
      else if (msg === 'timeout' || isAbort)     setState({ status: 'error', message: 'timeout' });
      else                                       setState({ status: 'error', message: msg });
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
