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
 *   'unknown'     — not yet checked, or not running in a native shell
 *   'checking'    — async check in progress
 *   'granted'     — full access granted
 *   'limited'     — iOS "Selected Photos" (photos only) — picker works but limited
 *   'prompt'      — not yet requested; user hasn't seen the OS dialog
 *   'denied'      — user denied; must go to Settings to re-enable
 *   'unavailable' — hardware not present or API not supported
 *   'n/a'         — permission type not applicable on this platform
 *
 * ── Timeout behaviour ────────────────────────────────────────────────────────
 * Every native plugin call is wrapped in a 5-second hard timeout via
 * withTimeout(). If the Capacitor bridge is slow to initialise (common on
 * first launch in TestFlight), the stalled check resolves to 'unavailable'
 * instead of leaving the row stuck on "Checking…" forever.
 *
 * Promise.allSettled() is used so one stalled check cannot block the others.
 *
 * ── iOS-specific rules ───────────────────────────────────────────────────────
 * On native iOS, navigator.permissions.query() is NOT used for microphone or
 * notifications. WKWebView's implementation of the Permissions API is
 * incomplete — microphone queries hang indefinitely and notifications queries
 * always return 'denied' regardless of the real system state. Instead:
 *   - Microphone: use @capacitor/microphone if available, otherwise 'n/a'
 *     (the plugin is not installed in this project, so we return 'n/a')
 *   - Notifications: use @capacitor/push-notifications checkPermissions()
 *
 * Usage:
 *   const perms = useNativePermissions();
 *   perms.camera   // PermissionStatus
 *   perms.photos   // PermissionStatus
 *   perms.location // PermissionStatus
 *   perms.refresh() // re-check all (call after returning from Settings)
 */

import { useState, useEffect, useCallback } from 'react';
import { isNative, getCameraPlugin, getNativeGeo, getPushNotifications } from '@/lib/capacitor-plugins';

export type PermissionStatus =
  | 'unknown'
  | 'checking'
  | 'granted'
  | 'limited'       // iOS "Selected Photos" — photos only
  | 'prompt'        // not yet requested
  | 'denied'
  | 'unavailable'
  | 'n/a';          // not applicable on this platform

export interface NativePermissionsState {
  camera:        PermissionStatus;
  photos:        PermissionStatus;
  location:      PermissionStatus;
  microphone:    PermissionStatus;
  notifications: PermissionStatus;
  /** Re-check all permissions — call after the user returns from iPhone Settings */
  refresh: () => void;
}

// ── Timeout helper ────────────────────────────────────────────────────────────

/**
 * Race a promise against a hard timeout.
 * Returns `fallback` if the timeout fires first.
 * Prevents any Capacitor plugin call from hanging the UI forever when the
 * bridge is slow to initialise or the plugin is missing at runtime.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// ── Per-permission checkers (read-only, no dialog) ────────────────────────────
// Each function is wrapped in a 5-second hard timeout so a stalled iOS plugin
// call cannot leave the row stuck on "Checking…" indefinitely.

async function checkCameraStatus(): Promise<PermissionStatus> {
  if (!isNative()) return 'unknown';
  try {
    const Camera = await withTimeout(getCameraPlugin(), 3000, null);
    if (!Camera) return 'unavailable';

    const s = await withTimeout(
      (Camera.checkPermissions() as unknown) as Promise<Record<string, string>>,
      5000,
      { camera: 'unknown' } as Record<string, string>,
    );
    const cam = s.camera ?? 'unknown';
    if (cam === 'granted') return 'granted';
    if (cam === 'denied')  return 'denied';
    if (cam === 'limited') return 'limited';
    if (cam === 'unknown') return 'unavailable';
    return 'prompt';
  } catch {
    return 'unavailable';
  }
}

async function checkPhotosStatus(): Promise<PermissionStatus> {
  if (!isNative()) return 'unknown';
  try {
    const Camera = await withTimeout(getCameraPlugin(), 3000, null);
    if (!Camera) return 'unavailable';

    const s = await withTimeout(
      (Camera.checkPermissions() as unknown) as Promise<Record<string, string>>,
      5000,
      { photos: 'unknown' } as Record<string, string>,
    );
    const photos = s.photos ?? s.camera ?? 'unknown';
    if (photos === 'granted') return 'granted';
    if (photos === 'limited') return 'limited';
    if (photos === 'denied')  return 'denied';
    if (photos === 'unknown') return 'unavailable';
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
        // Use a manual race — navigator.permissions.query returns a PermissionStatus
        // object, not a plain string, so we can't use the generic withTimeout helper.
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
        const result  = await Promise.race([navigator.permissions.query({ name: 'geolocation' }), timeout]);
        if (!result) return 'prompt'; // timed out
        if (result.state === 'granted') return 'granted';
        if (result.state === 'denied')  return 'denied';
        return 'prompt';
      } catch {
        return 'prompt';
      }
    }
    return 'prompt';
  }

  // Native path — use @capacitor/geolocation
  try {
    const geo = await withTimeout(getNativeGeo(), 3000, null);
    if (!geo) return 'unavailable';

    const s = await withTimeout(
      geo.checkPermissions() as unknown as Promise<{ location?: string; coarseLocation?: string }>,
      5000,
      { location: 'unknown', coarseLocation: 'unknown' },
    );
    const loc = s.location ?? s.coarseLocation ?? 'unknown';
    if (loc === 'granted' || loc === 'limited') return 'granted';
    if (loc === 'denied')  return 'denied';
    if (loc === 'unknown') return 'unavailable';
    return 'prompt';
  } catch {
    return 'unavailable';
  }
}

/**
 * Microphone permission check.
 *
 * ── iOS native ───────────────────────────────────────────────────────────────
 * Do NOT use navigator.permissions.query({ name: 'microphone' }) on native iOS.
 * WKWebView's Permissions API implementation is incomplete — microphone queries
 * hang indefinitely on iOS 16 and earlier, which is exactly the "Checking…"
 * freeze we are trying to fix.
 *
 * @capacitor/microphone is not installed in this project, so we return 'n/a'
 * on native. The UI should render this as "Not available" or hide the row.
 *
 * ── Web ───────────────────────────────────────────────────────────────────────
 * On web, navigator.permissions.query() works correctly on Chrome/Edge/Firefox.
 * Safari does not support it for microphone — we catch the error and return
 * 'unknown' so the row shows a neutral state rather than crashing.
 */
async function checkMicrophoneStatus(): Promise<PermissionStatus> {
  // On native iOS, do NOT use navigator.permissions — it hangs indefinitely.
  // @capacitor/microphone is not installed, so return 'n/a'.
  if (isNative()) return 'n/a';

  // Web path
  if (typeof navigator === 'undefined') return 'unknown';
  if (!navigator.permissions) return 'unknown';
  try {
    // Manual race — navigator.permissions.query returns a PermissionStatus object
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
    const result  = await Promise.race([
      navigator.permissions.query({ name: 'microphone' as PermissionName }),
      timeout,
    ]);
    if (!result) return 'unknown'; // timed out
    if (result.state === 'granted') return 'granted';
    if (result.state === 'denied')  return 'denied';
    return 'prompt';
  } catch {
    // Safari throws — microphone permission query not supported
    return 'unknown';
  }
}

/**
 * Notifications permission check.
 *
 * ── iOS native ───────────────────────────────────────────────────────────────
 * Do NOT use window.Notification.permission on native iOS.
 * WKWebView always reports 'denied' for Notification.permission regardless of
 * the real system state — this is a known WebKit limitation. Use the
 * @capacitor/push-notifications checkPermissions() instead, which queries the
 * real iOS UNUserNotificationCenter state.
 *
 * ── Web ───────────────────────────────────────────────────────────────────────
 * On web, window.Notification.permission is reliable on all modern browsers.
 */
async function checkNotificationsStatus(): Promise<PermissionStatus> {
  if (isNative()) {
    // Use @capacitor/push-notifications — queries real iOS UNUserNotificationCenter
    try {
      const PushNotif = await withTimeout(getPushNotifications(), 3000, null);
      if (!PushNotif) return 'unavailable';

      const s = await withTimeout(
        PushNotif.checkPermissions() as unknown as Promise<{ receive?: string }>,
        5000,
        { receive: 'unknown' },
      );
      const state = s.receive ?? 'unknown';
      if (state === 'granted') return 'granted';
      if (state === 'denied')  return 'denied';
      if (state === 'unknown') return 'unavailable';
      return 'prompt';
    } catch {
      return 'unavailable';
    }
  }

  // Web path — window.Notification.permission
  if (typeof window === 'undefined') return 'unknown';
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
      // Run all checks independently via Promise.allSettled so one stalled
      // iOS plugin call cannot block the others from resolving.
      // Each checker already has its own 5-second hard timeout, so the
      // entire batch resolves within ~5 seconds even in the worst case.
      const results = await Promise.allSettled([
        checkCameraStatus(),
        checkPhotosStatus(),
        checkLocationStatus(),
        checkMicrophoneStatus(),
        checkNotificationsStatus(),
      ]);

      if (cancelled) return;

      const resolve = (r: PromiseSettledResult<PermissionStatus>, fallback: PermissionStatus): PermissionStatus =>
        r.status === 'fulfilled' ? r.value : fallback;

      setCamera(resolve(results[0], 'unavailable'));
      setPhotos(resolve(results[1], 'unavailable'));
      setLocation(resolve(results[2], 'unavailable'));
      setMicrophone(resolve(results[3], 'unavailable'));
      setNotifications(resolve(results[4], 'unavailable'));
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
