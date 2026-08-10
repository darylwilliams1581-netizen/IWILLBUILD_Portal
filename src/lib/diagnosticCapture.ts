/**
 * diagnosticCapture.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Installs global event listeners that feed safe diagnostic events into the
 * circular buffer. Call initDiagnosticCapture() once at app startup.
 *
 * Captures:
 *   - JS errors + unhandled promise rejections
 *   - Network online/offline changes
 *
 * Does NOT capture:
 *   - Passwords, tokens, PINs, cookies, GPS coordinates, form contents,
 *     request/response bodies, or any sensitive user data.
 */

import {
  pushDiagEvent,
  sanitisePath,
  sanitiseErrorMsg,
} from './diagnosticBuffer.js';

let _installed = false;

export function initDiagnosticCapture(): void {
  if (_installed || typeof window === 'undefined') return;
  _installed = true;

  // ── JS errors ──────────────────────────────────────────────────────────────
  window.addEventListener('error', (e) => {
    try {
      const msg = sanitiseErrorMsg(e.message ?? 'Unknown error');
      const source = e.filename
        ? sanitisePath(new URL(e.filename).pathname)
        : '[unknown]';
      pushDiagEvent('js_error', msg, {
        route: window.location.pathname,
        meta: {
          source,
          line: e.lineno ?? 0,
          errorName: (e.error as Error | null)?.name ?? 'Error',
        },
      });
    } catch { /* never crash */ }
  });

  // ── Unhandled promise rejections ───────────────────────────────────────────
  window.addEventListener('unhandledrejection', (e) => {
    try {
      const reason = e.reason;
      const msg = sanitiseErrorMsg(
        typeof reason === 'string'
          ? reason
          : (reason as Error | null)?.message ?? 'Unhandled rejection',
      );
      pushDiagEvent('unhandled_rejection', msg, {
        route: window.location.pathname,
        meta: {
          errorName: (reason as Error | null)?.name ?? 'UnhandledRejection',
        },
      });
    } catch { /* never crash */ }
  });

  // ── Network online/offline ─────────────────────────────────────────────────
  window.addEventListener('online',  () => {
    pushDiagEvent('network_change', 'Network online',  { route: window.location.pathname });
  });
  window.addEventListener('offline', () => {
    pushDiagEvent('network_change', 'Network offline', { route: window.location.pathname });
  });
}

// ── Route change helper ────────────────────────────────────────────────────────
// Call this from your router's navigation listener.
export function recordRouteChange(pathname: string): void {
  pushDiagEvent('route_change', `Navigate → ${sanitisePath(pathname)}`, {
    route: sanitisePath(pathname),
  });
}

// ── Action helper ─────────────────────────────────────────────────────────────
// Call with a safe identifier like "fleet_retry_gps".
export function recordAction(actionId: string, route?: string): void {
  pushDiagEvent('action', actionId.slice(0, 100), {
    route: route ?? window.location.pathname,
  });
}

// ── API request helper ────────────────────────────────────────────────────────
// Call from your API client wrapper.
export function recordApiRequest(
  method: string,
  pathname: string,
  status: number,
  durationMs: number,
): void {
  const safePath = sanitisePath(pathname);
  const msg = `${method.toUpperCase()} ${safePath} → ${status} (${Math.round(durationMs)}ms)`;
  pushDiagEvent('api_request', msg, {
    route: window.location.pathname,
    status,
    duration: durationMs,
    meta: { method: method.toUpperCase(), path: safePath },
  });
}

// ── GPS state helper ──────────────────────────────────────────────────────────
export type GpsState = 'prompt' | 'granted' | 'denied' | 'waiting_fix' | 'live' | 'stale' | 'stopped';
export function recordGpsState(state: GpsState, sessionId?: string): void {
  pushDiagEvent('gps_state', `GPS: ${state}`, {
    route: window.location.pathname,
    meta: {
      state,
      ...(sessionId ? { sessionId: sessionId.slice(0, 20) } : {}),
    },
  });
}

// ── Camera state helper ───────────────────────────────────────────────────────
export type CameraState = 'available' | 'opened' | 'cancelled' | 'failed' | 'permission_denied';
export function recordCameraState(state: CameraState): void {
  pushDiagEvent('camera_state', `Camera: ${state}`, {
    route: window.location.pathname,
    meta: { state },
  });
}

// ── App foreground/background ─────────────────────────────────────────────────
export function recordAppState(state: 'foreground' | 'background'): void {
  pushDiagEvent('app_state', `App: ${state}`, {
    route: window.location.pathname,
    meta: { state },
  });
}

// ── Feature flag ──────────────────────────────────────────────────────────────
export function recordFeatureFlag(flag: string, enabled: boolean): void {
  pushDiagEvent('feature_flag', `Flag ${flag}: ${enabled ? 'on' : 'off'}`, {
    route: window.location.pathname,
    meta: { flag: flag.slice(0, 80), enabled },
  });
}

// ── Error boundary ────────────────────────────────────────────────────────────
export function recordErrorBoundary(componentName: string, errorMsg: string): void {
  pushDiagEvent('error_boundary', `ErrorBoundary: ${componentName}`, {
    route: window.location.pathname,
    meta: {
      component: componentName.slice(0, 80),
      error: sanitiseErrorMsg(errorMsg),
    },
  });
}
