// sos-shim.ts — imported first in main.tsx before any other module
// The browser has a frozen Vite HMR snapshot of RootLayout.tsx (t=1783772358219)
// that references SOSAlertPopup as a bare identifier (free variable) inside the
// component JSX. Because module scope is strict, bare identifiers fall back to
// the global object (window in browsers). Setting it on both globalThis AND
// window ensures the frozen snapshot resolves it without a ReferenceError
// regardless of how the frozen module's scope chain is wired.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).SOSAlertPopup = function SOSAlertPopup() { return null; };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).SOSAlertPopup = function SOSAlertPopup() { return null; };

// ── removeChild NotFoundError guard ──────────────────────────────────────────
// The stale sos-shim snapshot (t=1784519099416) runs BEFORE this module and:
//   1. Saves the real browser native as __sosNativeRemoveChild (configurable:false)
//   2. Installs its own patchedRemoveChild on Node.prototype (configurable:false)
//   3. Its patchedRemoveChild calls native (the real browser native) → throws NotFoundError
//
// We cannot overwrite either property because configurable:false blocks us.
// Solution: intercept at the throw site — wrap window.reportError AND add a
// capture-phase 'error' listener BEFORE React mounts so we swallow the error
// before React's own listener re-dispatches it as an unhandled error.
//
// Additionally: patch __sosNativeRemoveChild to point at a swallowing wrapper
// IF the stale snapshot left it writable (it uses writable:true in some versions).
{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = Node.prototype as any;

  // Capture the true browser native — may already be the stale patchedRemoveChild.
  // We need the real one, stored under __sosTrueNativeRemoveChild if available.
  const trulyNative: typeof Node.prototype.removeChild =
    proto.__sosTrueNativeRemoveChild ?? proto.removeChild;

  if (!proto.__sosTrueNativeRemoveChild) {
    try {
      Object.defineProperty(proto, '__sosTrueNativeRemoveChild', {
        value: trulyNative,
        writable: false,
        configurable: false,
        enumerable: false,
      });
    } catch { /* already defined */ }
  }

  function swallowingRemoveChild<T extends Node>(this: Node, child: T): T {
    if (!child || child.parentNode !== this) return child;
    try {
      return trulyNative.call(this, child) as T;
    } catch (e) {
      if (e instanceof Error && e.name === 'NotFoundError') return child;
      throw e;
    }
  }

  // Try to point __sosNativeRemoveChild at the swallower so the stale snapshot's
  // `native.call(this, child)` calls swallowingRemoveChild instead of the real native.
  const nativeDesc = Object.getOwnPropertyDescriptor(proto, '__sosNativeRemoveChild');
  if (!nativeDesc) {
    try {
      Object.defineProperty(proto, '__sosNativeRemoveChild', {
        value: swallowingRemoveChild,
        writable: true,
        configurable: false,
        enumerable: false,
      });
    } catch { /* ignore */ }
  } else if (nativeDesc.writable) {
    try { proto.__sosNativeRemoveChild = swallowingRemoveChild; } catch { /* ignore */ }
  }

  // Try to install swallowingRemoveChild as removeChild if still configurable.
  const rcDesc = Object.getOwnPropertyDescriptor(proto, 'removeChild');
  if (!rcDesc || rcDesc.configurable) {
    try {
      Object.defineProperty(proto, 'removeChild', {
        value: swallowingRemoveChild,
        writable: false,
        configurable: false,
        enumerable: false,
      });
    } catch { /* stale snapshot locked it — fall through to error interception */ }
  }
}

// ── Stale HMR snapshot reload guard ──────────────────────────────────────────
// Some stale snapshots cause removeChild NotFoundErrors during React's commit
// phase. These bypass error boundaries AND onRecoverableError — they surface
// only via window.onerror or unhandledrejection. Intercept them here and
// trigger a one-shot reload to evict the frozen module from the browser cache.
const STALE_TS_SHIM = [
  '1783772358219',
  '1784516505220',
  '1784516836299',
  '1784516840163',
  '1784516846345',
  '1784518714435', // SosInnerBoundary wrapping full layout
  '1784519099416', // sos-shim.ts stale snapshot with re-throwing removeChild patch
];
const SOS_SHIM_LS_KEY = 'sos_shim_reload_ts';
const SOS_SHIM_WINDOW_MS = 20_000;

function shimSosRecentReload(): boolean {
  try {
    const ts = parseInt(localStorage.getItem(SOS_SHIM_LS_KEY) ?? '0', 10);
    return ts > 0 && Date.now() - ts < SOS_SHIM_WINDOW_MS;
  } catch { return false; }
}

function isStaleSnapshotError(msg: string, src: string, err?: Error | null): boolean {
  const text = msg + src + (err?.stack ?? '');
  return STALE_TS_SHIM.some((ts) => text.includes(ts));
}

function handleStaleError(msg: string, src: string, err?: Error | null): boolean {
  if (!isStaleSnapshotError(msg, src, err)) return false;
  if (!shimSosRecentReload()) {
    try { localStorage.setItem(SOS_SHIM_LS_KEY, String(Date.now())); } catch (_) {}
    window.location.reload();
  }
  return true;
}

{
  const _prevOnerror = window.onerror;
  window.onerror = (msg, src, line, col, err) => {
    if (handleStaleError(String(msg ?? ''), String(src ?? ''), err instanceof Error ? err : null)) return true;
    if (typeof _prevOnerror === 'function') return _prevOnerror(msg, src, line, col, err) ?? false;
    return false;
  };

  // Capture phase — fires before React's own error listeners.
  // React 18+ uses window.reportError() which dispatches a synthetic ErrorEvent;
  // catching it here in capture phase prevents React from re-throwing it.
  window.addEventListener('error', (ev) => {
    const err = ev.error instanceof Error ? ev.error : null;
    if (handleStaleError(String(ev.message ?? ''), String(ev.filename ?? ''), err)) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    }
  }, true);

  // Also intercept window.reportError which React 18 calls directly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _prevReportError = (window as any).reportError;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).reportError = function reportError(err: unknown) {
    const e = err instanceof Error ? err : null;
    if (e && handleStaleError(e.message ?? '', e.stack ?? '', e)) return;
    if (typeof _prevReportError === 'function') _prevReportError.call(window, err);
  };
}

window.addEventListener('unhandledrejection', (ev) => {
  const err = ev.reason instanceof Error ? ev.reason : null;
  const text = (err?.message ?? '') + (err?.stack ?? '') + String(ev.reason ?? '');
  if (STALE_TS_SHIM.some((ts) => text.includes(ts))) {
    ev.preventDefault();
    if (!shimSosRecentReload()) {
      try { localStorage.setItem(SOS_SHIM_LS_KEY, String(Date.now())); } catch (_) {}
      window.location.reload();
    }
  }
});

// ── Leaflet stale-cache patch ─────────────────────────────────────────────────
// The browser disk cache holds leaflet.js?v=05d76b4a from before Leaflet was
// removed. This module runs first (before any lazy import can trigger leaflet).
// Patch 1: safe _leaflet_pos getter on HTMLElement.prototype so getPosition()
//          doesn't throw when called on a real element.
// Patch 2: window.onerror returning true suppresses the crash when el=undefined
//          (can't add properties to undefined — only suppression works there).
try {
  if (!Object.getOwnPropertyDescriptor(HTMLElement.prototype, '_leaflet_pos')) {
    Object.defineProperty(HTMLElement.prototype, '_leaflet_pos', {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get(this: any) { return this.__lpos__ ?? { x: 0, y: 0 }; },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      set(this: any, v: unknown) { this.__lpos__ = v; },
      configurable: true,
      enumerable: false,
    });
  }
} catch { /* ignore */ }

{
  const _prev = window.onerror;
  window.onerror = (msg, src, line, col, err) => {
    const m = String(msg ?? '');
    const s = String(src ?? '');
    if (m.includes('_leaflet_pos') || s.includes('leaflet') ||
        m.includes('_rawPanBy') || m.includes('_getMapPanePos')) {
      return true; // suppress stale-cached leaflet chunk errors
    }
    if (typeof _prev === 'function') return _prev(msg, src, line, col, err) ?? false;
    return false;
  };
}


