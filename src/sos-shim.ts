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
// The stale sos-shim snapshot (t=1784519099416) locked Node.prototype.removeChild
// with configurable:false. Its patchedRemoveChild calls the real browser native
// which throws NotFoundError when the child has already been removed.
//
// Strategy:
//   1. Extract the TRUE browser native via a sandboxed iframe (unaffected by
//      any Object.defineProperty on the main window's Node.prototype).
//   2. Install a swallowing wrapper that calls the true native directly.
//      If the slot is already locked (stale shim ran first), the defineProperty
//      fails silently — fall through to error-interception reload below.
{
  // Get the real browser native removeChild from a clean iframe prototype.
  // The iframe's Node.prototype is a separate object; no stale shim can have
  // patched it, so its removeChild is always the genuine host method.
  let trueNative: ((child: Node) => Node) | null = null;
  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.head.appendChild(iframe);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trueNative = (iframe.contentWindow as any)?.Node?.prototype?.removeChild ?? null;
    // Use the iframe's own native to remove itself — avoids calling the
    // potentially-stale patchedRemoveChild on the main window's prototype.
    if (trueNative && iframe.parentNode === document.head) {
      trueNative.call(document.head, iframe);
    }
  } catch { /* ignore — fall back to error interception */ }

  if (trueNative) {
    const _native = trueNative; // close over the clean reference
    // Expose on window so RootLayout's useEffect can use it for instance patching
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__sosRemoveChildNative = _native;

    // swallowingRemoveChild — calls the TRUE iframe native directly.
    // NEVER throws under any circumstance.
    function swallowingRemoveChild<T extends Node>(this: Node, child: T): T {
      try {
        if (child && child.parentNode === this) {
          _native.call(this, child);
        }
      } catch { /* swallow unconditionally */ }
      return child;
    }

    // ── Patch main window prototype chain ────────────────────────────────────
    // The stale shim locked Node.prototype.removeChild with configurable:false.
    // We can't redefine it there. But EventTarget.prototype sits ABOVE Node in
    // the chain and the stale shim never touched it — install our wrapper there
    // so ANY removeChild lookup that walks past Node.prototype finds ours first.
    // Also try Node.prototype in case this run happens before the stale shim.
    for (const proto of [EventTarget.prototype, Node.prototype, Element.prototype, HTMLElement.prototype, HTMLDivElement.prototype] as object[]) {
      try {
        const d = Object.getOwnPropertyDescriptor(proto, 'removeChild');
        if (!d || d.configurable) {
          Object.defineProperty(proto, 'removeChild', {
            value: swallowingRemoveChild,
            writable: false,
            configurable: false,
            enumerable: false,
          });
        }
      } catch { /* ignore locked slots */ }
    }

    // ── Patch ALL existing and future iframes ────────────────────────────────
    // The stale shim captured an iframe's Node.prototype.removeChild as its
    // _native. Patch every iframe's Node.prototype so that captured reference
    // itself becomes our safe wrapper.
    function patchIframeProto(iframe: HTMLIFrameElement) {
      try {
        const iWin = iframe.contentWindow as any;
        if (!iWin?.Node?.prototype) return;
        const iProto = iWin.Node.prototype;
        const d = Object.getOwnPropertyDescriptor(iProto, 'removeChild');
        if (!d || d.configurable) {
          Object.defineProperty(iProto, 'removeChild', {
            value: swallowingRemoveChild,
            writable: false,
            configurable: false,
            enumerable: false,
          });
        }
      } catch { /* ignore */ }
    }

    document.querySelectorAll('iframe').forEach(patchIframeProto);

    const iframeMo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (n instanceof HTMLIFrameElement) patchIframeProto(n);
          if (n instanceof Element) n.querySelectorAll('iframe').forEach(patchIframeProto);
        });
      }
    });
    iframeMo.observe(document.documentElement, { childList: true, subtree: true });

    // ── Instance-level patch via MutationObserver ────────────────────────────
    // Belt-and-suspenders: overwrite any own-property removeChild on DOM instances.
    function patchInstance(node: Node) {
      try {
        const n = node as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const d = Object.getOwnPropertyDescriptor(n, 'removeChild');
        if (!d || d.value === swallowingRemoveChild) return;
        try {
          if (d.configurable) {
            Object.defineProperty(n, 'removeChild', { value: swallowingRemoveChild, writable: true, configurable: true, enumerable: false });
          } else {
            delete n.removeChild;
            Object.defineProperty(n, 'removeChild', { value: swallowingRemoveChild, writable: true, configurable: true, enumerable: false });
          }
        } catch { /* truly locked */ }
      } catch { /* ignore */ }
    }

    document.querySelectorAll('*').forEach(patchInstance);
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) m.addedNodes.forEach(patchInstance);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
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
  '1784518714435',
  '1784519099416', // sos-shim.ts stale — re-throwing patchedRemoveChild
  '1784522000000',
];
const SOS_SHIM_LS_KEY = 'sos_shim_reload_ts';
const SOS_SHIM_COUNT_KEY = 'sos_shim_reload_count';
// Key that tracks which shim version last reset the counter.
// When the shim is updated, this changes and the counter resets automatically.
const SOS_SHIM_VERSION = '1784540000000';
const SOS_SHIM_VER_KEY = 'sos_shim_version';
const SOS_SHIM_WINDOW_MS = 8_000;
const SOS_SHIM_MAX_RELOADS = 5; // increased — stale shim may need more reloads to evict

// Reset counter when shim version changes (new deploy evicts old stale module)
try {
  if (localStorage.getItem(SOS_SHIM_VER_KEY) !== SOS_SHIM_VERSION) {
    localStorage.removeItem(SOS_SHIM_COUNT_KEY);
    localStorage.removeItem(SOS_SHIM_LS_KEY);
    localStorage.setItem(SOS_SHIM_VER_KEY, SOS_SHIM_VERSION);
  }
} catch (_) {}

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
  // Always suppress — even if we've hit the reload limit.
  // When under the limit, also trigger a reload to evict the stale module.
  if (!shimSosRecentReload()) doStaleReload();
  return true; // always swallow — never let this reach React's error boundary
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
    if (e && handleStaleError(e.message ?? '', e.stack ?? '', e)) return; // swallow
    if (typeof _prevReportError === 'function') _prevReportError.call(window, err);
  };

  // Patch console.error to suppress React's "The above error occurred..." message
  // that fires when a stale-shim error reaches React's error boundary internals.
  const _prevConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const text = args.map(a => String(a ?? '')).join(' ');
    if (
      text.includes('patchedRemoveChild') ||
      (text.includes('removeChild') && text.includes('sos-shim'))
    ) return; // suppress
    _prevConsoleError(...args);
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


