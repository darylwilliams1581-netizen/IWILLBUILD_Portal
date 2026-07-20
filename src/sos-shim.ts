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

{
  const _prevOnerror = window.onerror;
  window.onerror = (msg, src, line, col, err) => {
    const m = String(msg ?? '');
    const s = String(src ?? '');
    if (isStaleSnapshotError(m, s, err instanceof Error ? err : null)) {
      if (!shimSosRecentReload()) {
        try { localStorage.setItem(SOS_SHIM_LS_KEY, String(Date.now())); } catch (_) {}
        window.location.reload();
      }
      return true; // suppress the error
    }
    if (typeof _prevOnerror === 'function') return _prevOnerror(msg, src, line, col, err) ?? false;
    return false;
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

// ── removeChild NotFoundError guard ──────────────────────────────────────────
// The stale sos-shim snapshot (t=1784519099416) runs after this module and
// does `proto.removeChild = <re-throwing wrapper>`, overwriting our patch.
// Fix: store the true native once, then define removeChild as a non-writable
// non-configurable property so no subsequent assignment can overwrite it.
{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = Node.prototype as any;

  // Store the true native exactly once (before any patching).
  if (!proto.__sosNativeRemoveChild) {
    Object.defineProperty(proto, '__sosNativeRemoveChild', {
      value: proto.removeChild,
      writable: false,
      configurable: false,
      enumerable: false,
    });
  }

  const native = proto.__sosNativeRemoveChild as typeof Node.prototype.removeChild;

  function patchedRemoveChild<T extends Node>(this: Node, child: T): T {
    try {
      return native.call(this, child) as T;
    } catch (e) {
      if (e instanceof Error && e.name === 'NotFoundError') {
        return child; // node already gone — safe to swallow
      }
      throw e;
    }
  }

  // Define as non-configurable + non-writable so stale snapshots that do
  // `proto.removeChild = ...` (simple assignment) are silently ignored.
  const existing = Object.getOwnPropertyDescriptor(proto, 'removeChild');
  if (!existing || existing.configurable) {
    Object.defineProperty(proto, 'removeChild', {
      value: patchedRemoveChild,
      writable: false,
      configurable: false,
      enumerable: false,
    });
  }
}

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


