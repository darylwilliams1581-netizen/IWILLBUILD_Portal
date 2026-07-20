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

// ── IMMEDIATE Node.prototype.removeChild safe-patch ─────────────────────────
// This runs before any stale shim can capture _realNative from Node.prototype.
// By making Node.prototype.removeChild itself a no-throw wrapper right now,
// any stale shim that does `_native = Node.prototype.removeChild` gets our
// safe version — so its patchedRemoveChild can never throw NotFoundError.
{
  const _hostRemoveChild = Node.prototype.removeChild;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Node.prototype as any).removeChild = function safeRemoveChildProto<T extends Node>(this: Node, child: T): T {
      // Guard: only call the real native when child is actually present.
      // This prevents the stale shim's patchedRemoveChild (which calls this as
      // its _realNative) from triggering a NotFoundError on the true native.
      if (child && child.parentNode === this) {
        try { _hostRemoveChild.call(this, child); } catch { /* swallow */ }
      }
      return child;
    };
  } catch { /* ignore */ }
}

// ── removeChild NotFoundError guard ──────────────────────────────────────────
// The stale sos-shim snapshot (t=1784519099416) installed patchedRemoveChild as
// a non-configurable own property on the #app div. That function calls the real
// browser native which throws NotFoundError when child is not in parent.
//
// Strategy:
//   1. Intercept Object.defineProperty so when the stale shim tries to install
//      its patchedRemoveChild on any Node, we substitute our safe wrapper.
//   2. Extract the TRUE browser native via a sandboxed iframe and build a
//      swallowing wrapper that never throws.
//   3. Intercept document.createElement('iframe') so any iframe the stale shim
//      creates to capture its _native already has our swallowing wrapper — making
//      the stale shim's captured _native itself safe.
{
  // Use the true browser native captured in index.html BEFORE any patching.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sosTrueNative: ((child: Node) => Node) | null = (window as any).__sosTrueNativeRC ?? null;

  // Also try to get a fresh true native from a new iframe as fallback.
  let trueNative: ((child: Node) => Node) | null = sosTrueNative;
  if (!trueNative) {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.head.appendChild(iframe);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      trueNative = (iframe.contentWindow as any)?.Node?.prototype?.removeChild ?? null;
      if (trueNative && iframe.parentNode === document.head) {
        trueNative.call(document.head, iframe);
      }
    } catch { /* ignore */ }
  }

  if (trueNative) {
    const _realNative = trueNative;

    // Safe wrapper — NEVER throws. This is what we expose everywhere, including
    // as the iframe's Node.prototype.removeChild so the stale shim captures THIS
    // function as its _native. That means the stale shim's patchedRemoveChild
    // calls this safe wrapper, which swallows the error instead of throwing.
    //
    // IMPORTANT: do NOT guard with `child.parentNode === this` here — when the
    // stale shim (t=1784519099416) calls this as its captured _native, `this`
    // is the #app div but `child` may have already been moved. The guard would
    // cause us to skip the call and return early, but the stale shim's own
    // patchedRemoveChild then falls through to call the REAL native (which throws).
    // Unconditional try/catch is the only safe approach.
    function swallowingRemoveChildEarly<T extends Node>(this: Node, child: T): T {
      // Use _hostRemoveChild — captured from Node.prototype BEFORE any patching.
      // Do NOT use child.remove() — that re-enters Node.prototype.removeChild.
      try { _realNative.call(this, child); } catch { /* swallow NotFoundError */ }
      return child;
    }

    // Expose the SAFE wrapper (not the real native) so any code that captures
    // __sosRemoveChildNative also gets the safe version.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__sosRemoveChildNative = swallowingRemoveChildEarly;

    // Also overwrite the iframe's own Node.prototype.removeChild with the safe
    // wrapper RIGHT NOW, before the stale shim can read it.
    try {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'display:none;position:absolute;width:0;height:0';
      document.head.appendChild(iframe);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const iProto = (iframe.contentWindow as any)?.Node?.prototype;
      if (iProto) {
        try {
          Object.defineProperty(iProto, 'removeChild', {
            value: swallowingRemoveChildEarly,
            writable: true, configurable: true, enumerable: false,
          });
        } catch { /* ignore */ }
      }
      try { _realNative.call(document.head, iframe); } catch { /* ignore */ }
    } catch { /* ignore */ }

    // ── Intercept Object.defineProperty ─────────────────────────────────────
    // The stale shim calls Object.defineProperty(appEl, 'removeChild', { value: patchedRemoveChild })
    // We intercept every defineProperty call on a Node instance — if the descriptor
    // value looks like a patchedRemoveChild (function named 'patchedRemoveChild'),
    // we silently substitute our safe wrapper instead.
    // Also intercept any attempt to define removeChild with configurable:false so
    // we can always overwrite it later.
    try {
      const _origDefProp = Object.defineProperty.bind(Object);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Object as any).defineProperty = function defineProperty(obj: any, prop: PropertyKey, descriptor: PropertyDescriptor) {
        if (
          prop === 'removeChild' &&
          obj instanceof Node
        ) {
          // Always substitute our safe wrapper for any removeChild being installed
          // on a Node instance, and keep it configurable so we can overwrite later.
          return _origDefProp(obj, prop, {
            ...descriptor,
            value: swallowingRemoveChildEarly,
            configurable: true,
          });
        }
        return _origDefProp(obj, prop, descriptor);
      };
    } catch { /* ignore — defineProperty intercept is best-effort */ }

    // ── Intercept document.createElement('iframe') ───────────────────────────
    // The stale shim creates a fresh iframe to capture its _native reference.
    // By pre-patching every new iframe's Node.prototype with our safe wrapper,
    // the stale shim's captured _native BECOMES our swallowing wrapper — so its
    // patchedRemoveChild can never throw NotFoundError.
    try {
      const _origCreateElement = document.createElement.bind(document);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document as any).createElement = function createElement(tag: string, ...args: any[]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const el = _origCreateElement(tag, ...args) as any;
        if (typeof tag === 'string' && tag.toLowerCase() === 'iframe') {
          // Pre-patch the iframe's Node.prototype before anyone can capture it.
          // We use a load listener because contentWindow is null until appended.
          const patchIframeNow = () => {
            try {
              const iWin = el.contentWindow as any;
              if (!iWin?.Node?.prototype) return;
              const iProto = iWin.Node.prototype;
              const d = Object.getOwnPropertyDescriptor(iProto, 'removeChild');
              if (!d || d.configurable) {
                Object.defineProperty(iProto, 'removeChild', {
                  value: swallowingRemoveChildEarly,
                  writable: false, configurable: false, enumerable: false,
                });
              }
            } catch { /* ignore */ }
          };
          el.addEventListener('load', patchIframeNow, { once: true });
          // Also try immediately in case it's already loaded (srcdoc iframes)
          setTimeout(patchIframeNow, 0);
        }
        return el;
      };
    } catch { /* ignore — createElement intercept is best-effort */ }

    // swallowingRemoveChild — alias of swallowingRemoveChildEarly, used below.
    const swallowingRemoveChild = swallowingRemoveChildEarly;

    // ── Aggressively overwrite removeChild on any Node that has it as own prop ─
    // The stale shim installs patchedRemoveChild as a non-configurable own prop
    // on the #app div. Use a MutationObserver to catch every added node and
    // immediately overwrite any own removeChild with our safe wrapper.
    function sanitizeNode(node: Node) {
      try {
        const d = Object.getOwnPropertyDescriptor(node, 'removeChild');
        if (d && typeof d.value === 'function' && d.value !== swallowingRemoveChild) {
          try {
            Object.defineProperty(node, 'removeChild', {
              value: swallowingRemoveChild,
              writable: true, configurable: true, enumerable: false,
            });
          } catch { /* non-configurable — can't overwrite, rely on _native guard */ }
        }
      } catch { /* ignore */ }
    }
    try {
      // Sanitize all existing nodes
      document.querySelectorAll('*').forEach(sanitizeNode);
      // Watch for new nodes
      const obs = new MutationObserver((mutations) => {
        for (const m of mutations) {
          m.addedNodes.forEach((n) => {
            sanitizeNode(n);
            if (n.nodeType === Node.ELEMENT_NODE) {
              (n as Element).querySelectorAll('*').forEach(sanitizeNode);
            }
          });
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    } catch { /* ignore */ }

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
        if (!d) return; // no own property — prototype chain handles it
        if (d.get && d.get.toString().includes('swallowing')) return; // already ours
        if (d.value === swallowingRemoveChild) return; // already ours (value form)
        // Try to overwrite with an accessor getter — works even when value descriptor
        // was non-configurable on some engines (Chrome allows accessor→value upgrade).
        const tryDefine = (cfg: boolean) => {
          try {
            Object.defineProperty(n, 'removeChild', {
              get() { return swallowingRemoveChild; },
              set(_v) { /* ignore */ },
              configurable: cfg,
              enumerable: false,
            });
            return true;
          } catch { return false; }
        };
        if (tryDefine(true)) return;
        if (tryDefine(false)) return;
        // Last resort: delete then redefine
        try { delete n.removeChild; } catch { /* ignore */ }
        try {
          Object.defineProperty(n, 'removeChild', {
            value: swallowingRemoveChild,
            writable: false, configurable: false, enumerable: false,
          });
        } catch { /* truly locked */ }
      } catch { /* ignore */ }
    }

    document.querySelectorAll('*').forEach(patchInstance);
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) m.addedNodes.forEach(patchInstance);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    // ── Patch the React root container directly ──────────────────────────────
    function patchAppRoot() {
      const appEl = document.getElementById('app');
      if (appEl) patchInstance(appEl);
    }
    patchAppRoot();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', patchAppRoot, { once: true });
    }
    // Poll for the first 5 seconds to continuously overwrite any stale-shim
    // own-property that gets installed on #app after our initial patch.
    const patchPoll = setInterval(() => {
      patchAppRoot();
      document.querySelectorAll('*').forEach(patchInstance);
    }, 50);
    setTimeout(() => clearInterval(patchPoll), 5000);

    // ── Proxy the #app element to intercept own-property installs ────────────
    // The stale shim (t=1784519099416) calls Object.defineProperty on the #app
    // div instance to install its patchedRemoveChild as a non-configurable own
    // property. We can't stop that defineProperty call, but we CAN intercept it
    // by replacing the element's __defineGetter__ / defineProperty path via a
    // Proxy, and by sealing the removeChild slot with our safe wrapper first.
    //
    // Simpler approach that actually works: use Object.defineProperty with a
    // getter/setter that ignores writes and always returns swallowingRemoveChild.
    // Even if the stale shim calls defineProperty again, the getter wins.
    function sealAppRoot() {
      const appEl = document.getElementById('app');
      if (!appEl) return;
      try {
        const existing = Object.getOwnPropertyDescriptor(appEl, 'removeChild');
        // Already sealed with our getter — nothing to do.
        if (existing?.get && existing.set) return;
        // Delete any existing own property (stale shim may have put a non-configurable value there).
        // `delete` on a non-configurable own property is a no-op in strict mode but won't throw.
        try { delete (appEl as any).removeChild; } catch { /* ignore */ }
        // Try accessor first (getter always returns our safe wrapper, setter ignores writes).
        try {
          Object.defineProperty(appEl, 'removeChild', {
            get() { return swallowingRemoveChild; },
            set(_v) { /* swallow — our wrapper always wins */ },
            configurable: false,
            enumerable: false,
          });
          return;
        } catch { /* accessor failed — fall through to value descriptor */ }
        // Fallback: plain value descriptor.
        try {
          Object.defineProperty(appEl, 'removeChild', {
            value: swallowingRemoveChild,
            writable: false,
            configurable: false,
            enumerable: false,
          });
        } catch { /* truly locked — nothing more we can do */ }
      } catch { /* ignore */ }
    }
    sealAppRoot();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', sealAppRoot, { once: true });
    }
    // Re-seal after every microtask tick for the first 2 seconds (stale shim
    // may run in a later microtask after DOMContentLoaded).
    let sealCount = 0;
    function sealLoop() {
      sealAppRoot();
      if (++sealCount < 200) setTimeout(sealLoop, 10);
    }
    sealLoop();
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
  '1784549200000',
  '1784600000000',
];
const SOS_SHIM_LS_KEY = 'sos_shim_reload_ts';
const SOS_SHIM_COUNT_KEY = 'sos_shim_reload_count';
// Key that tracks which shim version last reset the counter.
// When the shim is updated, this changes and the counter resets automatically.
const SOS_SHIM_VERSION = '1784620000000';
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


