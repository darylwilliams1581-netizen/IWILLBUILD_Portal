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

// ── Bridge accessor ───────────────────────────────────────────────────────────
// All native plugin access goes through window.Capacitor.Plugins directly.
//
// WHY: Dynamic import('@capacitor/<plugin>') goes through Vite's module graph
// and can produce a broken chunk in the iOS bundle — the resolved module may
// not be the same registered bridge object, causing plugin calls to silently
// fail or return wrong values. The Capacitor docs recommend accessing plugins
// via window.Capacitor.Plugins which is guaranteed to return the real instance
// that the native bridge registered before the JS bundle ran.
//
// Static enum/constant imports at module level are still safe (pure JS values).

type CapBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
};

function getCapBridge(): CapBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { Capacitor?: CapBridge }).Capacitor;
}

function getPlugin<T>(name: string): T | null {
  if (!isNative()) return null;
  const plugin = getCapBridge()?.Plugins?.[name];
  return (plugin as T) ?? null;
}

// ── Plugin type interfaces ────────────────────────────────────────────────────

interface GeolocationPlugin {
  getCurrentPosition: (opts?: Record<string, unknown>) => Promise<{ coords: { latitude: number; longitude: number; accuracy: number; altitude?: number | null; altitudeAccuracy?: number | null; heading?: number | null; speed?: number | null }; timestamp: number }>;
  watchPosition: (opts: Record<string, unknown>, callback: (pos: unknown, err?: unknown) => void) => Promise<string>;
  clearWatch: (opts: { id: string }) => Promise<void>;
  checkPermissions: () => Promise<Record<string, string>>;
  requestPermissions: (opts?: { permissions: string[] }) => Promise<Record<string, string>>;
}

interface HapticsPlugin {
  impact: (opts: { style: string }) => Promise<void>;
  notification: (opts: { type: string }) => Promise<void>;
  vibrate: (opts?: { duration?: number }) => Promise<void>;
}

interface StatusBarPlugin {
  setStyle: (opts: { style: string }) => Promise<void>;
  setBackgroundColor: (opts: { color: string }) => Promise<void>;
  show: () => Promise<void>;
  hide: () => Promise<void>;
}

interface SplashScreenPlugin {
  hide: (opts?: { fadeOutDuration?: number }) => Promise<void>;
  show: (opts?: { fadeInDuration?: number; showDuration?: number; autoHide?: boolean }) => Promise<void>;
}

interface NetworkPlugin {
  getStatus: () => Promise<{ connected: boolean; connectionType: string }>;
  addListener: (event: string, cb: (status: { connected: boolean; connectionType: string }) => void) => Promise<{ remove: () => void }>;
}

interface PushNotificationsPlugin {
  requestPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  addListener: (event: string, cb: (data: unknown) => void) => Promise<{ remove: () => void }>;
}

interface AppPlugin {
  openUrl: (opts: { url: string }) => Promise<void>;
  exitApp: () => Promise<void>;
  addListener: (event: string, cb: (data: unknown) => void) => Promise<{ remove: () => void }>;
  getInfo: () => Promise<{ name: string; id: string; build: string; version: string }>;
}

interface CameraPlugin {
  getPhoto: (opts: Record<string, unknown>) => Promise<{ base64String?: string; dataUrl?: string; format?: string; path?: string; webPath?: string }>;
  checkPermissions: () => Promise<Record<string, string>>;
  requestPermissions: (opts: { permissions: string[] }) => Promise<Record<string, string>>;
  savePhoto: (opts: { path: string }) => Promise<void>;
}

// ── Haptic enum constants (inline — avoids dynamic import startup crash) ──────
// ImpactStyle and NotificationType are pure string enums in @capacitor/haptics.
// Verified from package source: Light='LIGHT', Medium='MEDIUM', Heavy='HEAVY',
// Success='SUCCESS', Warning='WARNING', Error='ERROR'.
const ImpactStyle = { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' } as const;
const NotificationType = { Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' } as const;

// StatusBar Style enum: Dark='DARK', Light='LIGHT', Default='DEFAULT'
const StatusBarStyle = { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' } as const;

// ── Plugin accessors ──────────────────────────────────────────────────────────

export function getNativeGeo(): GeolocationPlugin | null {
  return getPlugin<GeolocationPlugin>('Geolocation');
}

export function getHapticsPlugin(): { Haptics: HapticsPlugin; ImpactStyle: typeof ImpactStyle; NotificationType: typeof NotificationType } | null {
  const Haptics = getPlugin<HapticsPlugin>('Haptics');
  if (!Haptics) return null;
  return { Haptics, ImpactStyle, NotificationType };
}

export function getStatusBarPlugin(): { StatusBar: StatusBarPlugin; Style: typeof StatusBarStyle } | null {
  const StatusBar = getPlugin<StatusBarPlugin>('StatusBar');
  if (!StatusBar) return null;
  return { StatusBar, Style: StatusBarStyle };
}

export function getSplashScreenPlugin(): SplashScreenPlugin | null {
  return getPlugin<SplashScreenPlugin>('SplashScreen');
}

export function getNetworkPlugin(): NetworkPlugin | null {
  return getPlugin<NetworkPlugin>('Network');
}

export function getPushNotificationsPlugin(): PushNotificationsPlugin | null {
  return getPlugin<PushNotificationsPlugin>('PushNotifications');
}

export function getAppPlugin(): AppPlugin | null {
  return getPlugin<AppPlugin>('App');
}

export function getCameraPlugin(): CameraPlugin | null {
  return getPlugin<CameraPlugin>('Camera');
}

// ── Async wrappers (backwards-compatible) ────────────────────────────────────
// These preserve the async API that existing callers expect (await getNativeGeo()).

export async function getHaptics() {
  return getHapticsPlugin();
}

export async function getStatusBar() {
  return getStatusBarPlugin();
}

export async function getSplashScreen() {
  return getSplashScreenPlugin();
}

export async function getPushNotifications() {
  return getPushNotificationsPlugin();
}

// getAppPlugin and getNetworkPlugin are exported as sync functions above.
// Callers that previously used .then() should wrap with Promise.resolve() or use await.

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
