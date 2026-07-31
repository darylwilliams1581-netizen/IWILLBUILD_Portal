/**
 * capacitor-plugins.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lazy-loads Capacitor native plugins only when running inside a Capacitor
 * native shell (iOS / Android). Falls back gracefully to browser APIs on web.
 *
 * Usage:
 *   import { getNativeGeo, getHaptics, getNetwork } from '@/lib/capacitor-plugins';
 *
 *   const geo = await getNativeGeo();
 *   if (geo) {
 *     const pos = await geo.getCurrentPosition({ enableHighAccuracy: true });
 *   }
 */

// ── Platform detection ────────────────────────────────────────────────────────

/**
 * Returns true when the app is running inside a Capacitor native shell.
 * Safe to call during SSR (returns false).
 */
export function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  // Capacitor injects window.Capacitor when running in the native shell
  return !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor?.isNativePlatform?.();
}

/**
 * Returns 'ios' | 'android' | 'web'
 */
export function getPlatform(): 'ios' | 'android' | 'web' {
  if (typeof window === 'undefined') return 'web';
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const p = cap?.getPlatform?.();
  if (p === 'ios') return 'ios';
  if (p === 'android') return 'android';
  return 'web';
}

// ── Lazy plugin loaders ───────────────────────────────────────────────────────
// Each returns the plugin instance or null if not in a native context.
// Lazy-loading keeps the web bundle size unchanged.

export async function getNativeGeo() {
  if (!isNative()) return null;
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    return Geolocation;
  } catch {
    return null;
  }
}

export async function getHaptics() {
  if (!isNative()) return null;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
    return { Haptics, ImpactStyle, NotificationType };
  } catch {
    return null;
  }
}

export async function getStatusBar() {
  if (!isNative()) return null;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    return { StatusBar, Style };
  } catch {
    return null;
  }
}

export async function getSplashScreen() {
  if (!isNative()) return null;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    return SplashScreen;
  } catch {
    return null;
  }
}

export async function getNetworkPlugin() {
  if (!isNative()) return null;
  try {
    const { Network } = await import('@capacitor/network');
    return Network;
  } catch {
    return null;
  }
}

export async function getPushNotifications() {
  if (!isNative()) return null;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    return PushNotifications;
  } catch {
    return null;
  }
}

export async function getAppPlugin() {
  if (!isNative()) return null;
  try {
    const { App } = await import('@capacitor/app');
    return App;
  } catch {
    return null;
  }
}

/**
 * Returns the @capacitor/camera Camera plugin, or null on web / if unavailable.
 *
 * Used for:
 *   - checkPermissions()   — read current camera / photos permission state
 *   - requestPermissions() — trigger the native iOS permission dialog
 *   - savePhoto()          — save a photo to the device camera roll
 *
 * @capacitor/camera must be installed (it is — see package.json) AND the native
 * project must have been synced with `npx cap sync` for the plugin to be present
 * in the WKWebView's Capacitor.Plugins registry at runtime.
 */
export async function getCameraPlugin() {
  if (!isNative()) return null;
  try {
    const { Camera } = await import('@capacitor/camera');
    return Camera;
  } catch {
    return null;
  }
}

// ── Haptic helpers ────────────────────────────────────────────────────────────
// Convenience wrappers — safe to call on web (no-op).

export async function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'medium') {
  const h = await getHaptics();
  if (!h) return;
  const styleMap = {
    light: h.ImpactStyle.Light,
    medium: h.ImpactStyle.Medium,
    heavy: h.ImpactStyle.Heavy,
  };
  await h.Haptics.impact({ style: styleMap[style] });
}

export async function hapticSuccess() {
  const h = await getHaptics();
  if (!h) return;
  await h.Haptics.notification({ type: h.NotificationType.Success });
}

export async function hapticError() {
  const h = await getHaptics();
  if (!h) return;
  await h.Haptics.notification({ type: h.NotificationType.Error });
}

export async function hapticWarning() {
  const h = await getHaptics();
  if (!h) return;
  await h.Haptics.notification({ type: h.NotificationType.Warning });
}
