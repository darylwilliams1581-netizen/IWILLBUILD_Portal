/**
 * useGpsPermission
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified GPS permission hook for Capacitor (iOS/Android) and browser.
 *
 * States:
 *   'unknown'   — not yet checked (initial)
 *   'checking'  — async check in progress
 *   'prompt'    — permission not yet requested; user must tap "Enable Location"
 *   'granted'   — permission granted
 *   'denied'    — permission denied; user must go to Settings
 *   'unavailable' — geolocation not supported on this device
 *
 * Usage:
 *   const { status, request, openSettings } = useGpsPermission();
 *
 *   if (status === 'prompt')   → show "Enable Location" button → call request()
 *   if (status === 'denied')   → show "Open Settings" link → call openSettings()
 *   if (status === 'granted')  → proceed with GPS
 *   if (status === 'unavailable') → show "GPS not supported" message
 */

import { useState, useEffect, useCallback } from 'react';
import { isNative, getNativeGeo } from '@/lib/capacitor-plugins';

export type GpsPermissionStatus =
  | 'unknown'
  | 'checking'
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'unavailable';

interface UseGpsPermissionReturn {
  status: GpsPermissionStatus;
  /** Proactively request permission (triggers the OS dialog on first call) */
  request: () => Promise<GpsPermissionStatus>;
  /** Open device Settings so the user can re-enable location */
  openSettings: () => Promise<void>;
}

export function useGpsPermission(): UseGpsPermissionReturn {
  const [status, setStatus] = useState<GpsPermissionStatus>('unknown');

  // ── Check permission on mount (without prompting) ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    setStatus('checking');

    async function check() {
      // ── Capacitor native path ──────────────────────────────────────────────
      if (isNative()) {
        const geo = await getNativeGeo();
        if (!geo) {
          if (!cancelled) setStatus('unavailable');
          return;
        }
        try {
          const s = await geo.checkPermissions();
          if (cancelled) return;
          if (s.location === 'granted' || s.location === 'limited') {
            setStatus('granted');
          } else if (s.location === 'denied') {
            setStatus('denied');
          } else {
            // 'prompt' or 'prompt-with-rationale'
            setStatus('prompt');
          }
        } catch {
          if (!cancelled) setStatus('unavailable');
        }
        return;
      }

      // ── Browser path ───────────────────────────────────────────────────────
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        if (!cancelled) setStatus('unavailable');
        return;
      }

      if (navigator.permissions) {
        try {
          const perm = await navigator.permissions.query({ name: 'geolocation' });
          if (cancelled) return;
          if (perm.state === 'granted') {
            setStatus('granted');
          } else if (perm.state === 'denied') {
            setStatus('denied');
          } else {
            setStatus('prompt');
          }
          // Watch for runtime changes (user toggles in browser settings)
          perm.onchange = () => {
            if (perm.state === 'granted') setStatus('granted');
            else if (perm.state === 'denied') setStatus('denied');
            else setStatus('prompt');
          };
          return;
        } catch {
          // Permissions API not supported — fall through to 'prompt'
        }
      }

      // No Permissions API — assume 'prompt' (will trigger dialog on request)
      if (!cancelled) setStatus('prompt');
    }

    void check();
    return () => { cancelled = true; };
  }, []);

  // ── Request permission (triggers OS dialog) ───────────────────────────────
  const request = useCallback(async (): Promise<GpsPermissionStatus> => {
    setStatus('checking');

    // ── Capacitor native path ────────────────────────────────────────────────
    if (isNative()) {
      const geo = await getNativeGeo();
      if (!geo) {
        setStatus('unavailable');
        return 'unavailable';
      }
      try {
        // First check — if already granted, skip the dialog
        const current = await geo.checkPermissions();
        if (current.location === 'granted' || current.location === 'limited') {
          setStatus('granted');
          return 'granted';
        }
        if (current.location === 'denied') {
          setStatus('denied');
          return 'denied';
        }
        // Request the permission
        const requested = await geo.requestPermissions();
        const next: GpsPermissionStatus =
          requested.location === 'granted' || requested.location === 'limited'
            ? 'granted'
            : requested.location === 'denied'
            ? 'denied'
            : 'prompt';
        setStatus(next);
        return next;
      } catch {
        setStatus('unavailable');
        return 'unavailable';
      }
    }

    // ── Browser path ─────────────────────────────────────────────────────────
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return 'unavailable';
    }

    return new Promise<GpsPermissionStatus>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          setStatus('granted');
          resolve('granted');
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setStatus('denied');
            resolve('denied');
          } else {
            // Timeout / unavailable — treat as granted (position just failed)
            setStatus('granted');
            resolve('granted');
          }
        },
        { timeout: 10_000, maximumAge: 60_000, enableHighAccuracy: false }
      );
    });
  }, []);

  // ── Open device Settings ──────────────────────────────────────────────────
  const openSettings = useCallback(async (): Promise<void> => {
    if (isNative()) {
      try {
        const { App } = await import('@capacitor/app');
        // openSettings is available on Capacitor 5+
        // @ts-expect-error openSettings may not be typed in all versions
        await App.openSettings?.();
      } catch { /* silent */ }
    }
    // On web there is no programmatic way to open browser settings
  }, []);

  return { status, request, openSettings };
}
