/**
 * useNativePermissions
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads the current status of all native permissions WITHOUT triggering any
 * OS permission dialog. Safe to call on mount — it only calls checkPermissions(),
 * never requestPermissions().
 *
 * Used by the App Permissions settings tab to show real current status for
 * camera, photos, location, microphone, and notifications.
 *
 * States per permission:
 *   'unknown'   — not yet checked, or not running in a native shell
 *   'checking'  — async check in progress
 *   'granted'   — full access granted
 *   'limited'   — iOS "Selected Photos" (photos only) — picker works but limited
 *   'prompt'    — not yet requested; user hasn't seen the OS dialog
 *   'denied'    — user denied; must go to Settings to re-enable
 *   'unavailable' — hardware not present or API not supported
 *
 * Usage:
 *   const perms = useNativePermissions();
 *   perms.camera   // PermissionStatus
 *   perms.photos   // PermissionStatus
 *   perms.location // PermissionStatus
 *   perms.refresh() // re-check all (call after returning from Settings)
 */

import { useState, useEffect, useCallback } from 'react';
import { isNative, getCameraPlugin, getNativeGeo } from '@/lib/capacitor-plugins';

export type PermissionStatus =
  | 'unknown'
  | 'checking'
  | 'granted'
  | 'limited'      // iOS "Selected Photos" — photos only
  | 'prompt'       // not yet requested
  | 'denied'
  | 'unavailable';

export interface NativePermissionsState {
  camera:        PermissionStatus;
  photos:        PermissionStatus;
  location:      PermissionStatus;
  microphone:    PermissionStatus;
  notifications: PermissionStatus;
  /** Re-check all permissions — call after the user returns from iPhone Settings */
  refresh: () => void;
}

// ── Internal checkers (read-only, no dialog) ──────────────────────────────────

async function checkCameraStatus(): Promise<PermissionStatus> {
  if (!isNative()) return 'unknown';
  try {
    const Camera = await getCameraPlugin();
    if (!Camera) return 'unknown';
    const s = await Camera.checkPermissions();
    const cam = (s as { camera?: string }).camera ?? 'prompt';
    if (cam === 'granted') return 'granted';
    if (cam === 'denied')  return 'denied';
    if (cam === 'limited') return 'limited';
    return 'prompt';
  } catch {
    return 'unavailable';
  }
}

async function checkPhotosStatus(): Promise<PermissionStatus> {
  if (!isNative()) return 'unknown';
  try {
    const Camera = await getCameraPlugin();
    if (!Camera) return 'unknown';
    const s = await Camera.checkPermissions();
    const photos = (s as { photos?: string }).photos
      ?? (s as { camera?: string }).camera
      ?? 'prompt';
    if (photos === 'granted') return 'granted';
    if (photos === 'limited') return 'limited';
    if (photos === 'denied')  return 'denied';
    return 'prompt';
  } catch {
    return 'unavailable';
  }
}

async function checkLocationStatus(): Promise<PermissionStatus> {
  if (!isNative()) {
    // Browser path — use Permissions API if available
    if (typeof navigator === 'undefined') return 'unknown';
    if (!navigator.geolocation) return 'unavailable';
    if (navigator.permissions) {
      try {
        const p = await navigator.permissions.query({ name: 'geolocation' });
        if (p.state === 'granted') return 'granted';
        if (p.state === 'denied')  return 'denied';
        return 'prompt';
      } catch {
        return 'prompt';
      }
    }
    return 'prompt';
  }
  try {
    const geo = await getNativeGeo();
    if (!geo) return 'unavailable';
    const s = await geo.checkPermissions();
    const loc = s.location ?? s.coarseLocation ?? 'prompt';
    if (loc === 'granted' || loc === 'limited') return 'granted';
    if (loc === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unavailable';
  }
}

async function checkMicrophoneStatus(): Promise<PermissionStatus> {
  // @capacitor/microphone is not installed — use browser Permissions API
  if (typeof navigator === 'undefined') return 'unknown';
  if (!navigator.permissions) return 'unknown';
  try {
    const p = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    if (p.state === 'granted') return 'granted';
    if (p.state === 'denied')  return 'denied';
    return 'prompt';
  } catch {
    // Microphone permission query not supported on this platform
    return 'unknown';
  }
}

async function checkNotificationsStatus(): Promise<PermissionStatus> {
  if (typeof window === 'undefined') return 'unknown';
  // Web Notifications API
  if (!('Notification' in window)) return 'unavailable';
  const perm = (window as { Notification?: { permission?: string } }).Notification?.permission;
  if (perm === 'granted') return 'granted';
  if (perm === 'denied')  return 'denied';
  return 'prompt';
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useNativePermissions(): NativePermissionsState {
  const [camera,        setCamera]        = useState<PermissionStatus>('checking');
  const [photos,        setPhotos]        = useState<PermissionStatus>('checking');
  const [location,      setLocation]      = useState<PermissionStatus>('checking');
  const [microphone,    setMicrophone]    = useState<PermissionStatus>('checking');
  const [notifications, setNotifications] = useState<PermissionStatus>('checking');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // Run all checks in parallel — none of them trigger a dialog
      const [cam, ph, loc, mic, notif] = await Promise.all([
        checkCameraStatus(),
        checkPhotosStatus(),
        checkLocationStatus(),
        checkMicrophoneStatus(),
        checkNotificationsStatus(),
      ]);
      if (cancelled) return;
      setCamera(cam);
      setPhotos(ph);
      setLocation(loc);
      setMicrophone(mic);
      setNotifications(notif);
    }

    void run();
    return () => { cancelled = true; };
  }, [tick]); // re-run when tick changes (triggered by refresh())

  const refresh = useCallback(() => {
    // Reset all to 'checking' then re-run the effect
    setCamera('checking');
    setPhotos('checking');
    setLocation('checking');
    setMicrophone('checking');
    setNotifications('checking');
    setTick(t => t + 1);
  }, []);

  return { camera, photos, location, microphone, notifications, refresh };
}
