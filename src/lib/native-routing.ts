/**
 * native-routing.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for native-app routing decisions.
 *
 * Rules:
 *   - isNativeApp  → running inside Capacitor iOS/Android shell
 *   - On native cold-open: skip the public landing page entirely.
 *     Authenticated  → /home
 *     Unauthenticated → /login
 *   - On web browser: keep existing public landing page behaviour.
 *   - After login on native: always go to /home (never back to /).
 *   - After logout on native: always go to /login.
 *   - "Open web portal" on native login: open https://iwillbuild.com in the
 *     system browser (not the WebView) using Capacitor Browser or _system target.
 */

import { isNative } from './capacitor-plugins';

/** True when running inside a Capacitor iOS or Android shell. */
export const isNativeApp: boolean = isNative();

/** The canonical post-login destination for native app users. */
export const NATIVE_HOME = '/home';

/** The canonical post-logout / unauthenticated destination for native app users. */
export const NATIVE_LOGIN = '/login';

/** The public marketing site URL — opened externally from the native app. */
export const WEB_PORTAL_URL = 'https://iwillbuild.com';

/**
 * Open a URL in the system browser (outside the WebView).
 *
 * @capacitor/browser is not installed in this project, so we use the
 * window.open(_system) approach which Capacitor intercepts and routes to
 * the OS default browser (Safari on iOS, Chrome on Android).
 *
 * If @capacitor/browser is added in the future, swap the body to:
 *   const { Browser } = await import('@capacitor/browser');
 *   await Browser.open({ url, presentationStyle: 'fullscreen' });
 */
export function openExternalUrl(url: string): void {
  // '_system' is the Capacitor/Cordova convention for "open in OS browser"
  window.open(url, '_system');
}
