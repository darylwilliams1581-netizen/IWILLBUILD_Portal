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
// Call chain when the stale shim (t=1784519099416) is in the browser cache:
//   React → node.removeChild(child)
//     → stale patchedRemoveChild  [locked on Node.prototype, configurable:false]
//       → __sosNativeRemoveChild.call(this, child)  [= real browser native]
//         → throws NotFoundError
//
// The stale patchedRemoveChild has NO try/catch (older version).
// We cannot replace Node.prototype.removeChild (configurable:false).
// We cannot replace __sosNativeRemoveChild (writable:false, configurable:false).
//
// Only lever left: make the real browser native not throw by wrapping it at
// the Reflect level — not possible for host methods.
//
// Fallback: intercept the error via window.reportError + capture-phase listener
// and trigger a reload. The SosInnerBoundary in RootLayout also catches it and
// renders null + reloads, preventing the error UI from persisting.
{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = Node.prototype as any;

  // Best-effort: capture the real browser native before any patching.
  // If the stale shim already ran, proto.removeChild is its patchedRemoveChild.
  // proto.__sosNativeRemoveChild is the real native (set by stale shim, writable:false).
  // We want trulyNative = the real browser native for our own swallower.
  const trulyNative: typeof Node.prototype.removeChild = (() => {
    // Try to get the real native via a known-clean iframe's prototype
    try {
      const iframe = document.createElement('iframe');
      document.head.appendChild(iframe);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fn = (iframe.contentWindow as any)?.Node?.prototype?.removeChild;
      document.head.removeChild(iframe);
      if (typeof fn === 'function') return fn as typeof Node.prototype.removeChild;
    } catch { /* ignore */ }
    // Fall back: use whatever is on the prototype (may be stale patchedRemoveChild)
    return proto.removeChild as typeof Node.prototype.removeChild;
  })();

  function swallowingRemoveChild<T extends Node>(this: Node, child: T): T {
    if (!child || child.parentNode !== this) return child;
    try {
      return trulyNative.call(this, child) as T;
    } catch (e) {
      if (e instanceof Error && e.name === 'NotFoundError') return child;
      throw e;
    }
  }

  // Install swallowingRemoveChild as removeChild if not already locked.
  const rcDesc = Object.getOwnPropertyDescriptor(proto, 'removeChild');
  if (!rcDesc || rcDesc.configurable) {
    try {
      Object.defineProperty(proto, 'removeChild', {
        value: swallowingRemoveChild,
        writable: false,
        configurable: false,
        enumerable: false,
      });
    } catch { /* stale snapshot locked it — rely on error interception */ }
  }

  // Best-effort: redirect __sosNativeRemoveChild to swallower so the stale
  // patchedRemoveChild calls our swallower instead of the real throwing native.
  // The stale shim sets this writable:false — the assignment will silently fail
  // in sloppy mode or throw in strict mode; we catch both.
  try {
    const desc = Object.getOwnPropertyDescriptor(proto, '__sosNativeRemoveChild');
    if (desc?.writable) proto.__sosNativeRemoveChild = swallowingRemoveChild;
  } catch { /* ignore */ }
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
const SOS_SHIM_COUNT_KEY = 'sos_shim_reload_count';
const SOS_SHIM_WINDOW_MS = 8_000;   // shorter window — reload more aggressively
const SOS_SHIM_MAX_RELOADS = 3;     // give up after 3 rapid reloads (avoid infinite loop)

function shimSosRecentReload(): boolean {
  try {
    const ts = parseInt(localStorage.getItem(SOS_SHIM_LS_KEY) ?? '0', 10);
    const count = parseInt(localStorage.getItem(SOS_SHIM_COUNT_KEY) ?? '0', 10);
    const recent = ts > 0 && Date.now() - ts < SOS_SHIM_WINDOW_MS;
    if (recent && count >= SOS_SHIM_MAX_RELOADS) return true; // give up
    return false;
  } catch { return false; }
}

function doStaleReload(): void {
  try {
    const count = parseInt(localStorage.getItem(SOS_SHIM_COUNT_KEY) ?? '0', 10);
    localStorage.setItem(SOS_SHIM_LS_KEY, String(Date.now()));
    localStorage.setItem(SOS_SHIM_COUNT_KEY, String(count + 1));
  } catch (_) {}
  // Use location.replace to avoid adding to history, and force cache bypass
  window.location.reload();
}

// Reset the reload counter after a clean load (5 seconds with no stale errors)
setTimeout(() => {
  try { localStorage.removeItem(SOS_SHIM_COUNT_KEY); } catch (_) {}
}, 5000);

function isStaleSnapshotError(msg: string, src: string, err?: Error | null): boolean {
  const text = msg + src + (err?.stack ?? '');
  if (STALE_TS_SHIM.some((ts) => text.includes(ts))) return true;
  // Also catch any NotFoundError thrown from a patchedRemoveChild in any stale shim
  // (the stack always contains "patchedRemoveChild" and "sos-shim.ts")
  if (
    (msg.includes('removeChild') || (err?.name === 'NotFoundError')) &&
    text.includes('patchedRemoveChild') &&
    text.includes('sos-shim.ts')
  ) return true;
  return false;
}

function handleStaleError(msg: string, src: string, err?: Error | null): boolean {
  if (!isStaleSnapshotError(msg, src, err)) return false;
  if (!shimSosRecentReload()) doStaleReload();
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
    // Check message, filename, AND the error's stack (filename may be empty for reportError events)
    const src = String(ev.filename ?? '') + (err?.stack ?? '');
    if (handleStaleError(String(ev.message ?? ''), src, err)) {
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
    if (!shimSosRecentReload()) doStaleReload();
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


