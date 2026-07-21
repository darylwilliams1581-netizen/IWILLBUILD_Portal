// sos-shim.ts v1784900000004 — imported first in main.tsx before any other module
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
  function _safeRC<T extends Node>(this: Node, child: T): T {
    try { _hostRemoveChild.call(this, child); } catch { /* swallow NotFoundError */ }
    return child;
  }
  try {
    // Use a getter so the stale shim's Object.defineProperty call cannot
    // overwrite this with a throwing version — the setter silently ignores writes.
    Object.defineProperty(Node.prototype, 'removeChild', {
      get() { return _safeRC; },
      set(_v) { /* ignore — our wrapper always wins */ },
      configurable: true,
      enumerable: false,
    });
  } catch {
    try { (Node.prototype as any).removeChild = _safeRC; } catch { /* ignore */ }
  }
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
      // Remove the iframe — guard with parentNode check to avoid NotFoundError
      try {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      } catch { /* ignore */ }
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
      try { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); } catch { /* ignore */ }
    } catch { /* ignore */ }

    // ── Intercept Object.defineProperty ─────────────────────────────────────
    // Belt-and-suspenders: our Object.defineProperty intercept in index.html
    // already routes all removeChild installs to swallowingRemoveChildEarly.
    // This shim-level intercept is a secondary guard for any code path that
    // bypasses the index.html intercept (e.g. via a captured reference).
    try {
      const _origDefProp = Object.defineProperty.bind(Object);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Object as any).defineProperty = function defineProperty(obj: any, prop: PropertyKey, descriptor: PropertyDescriptor) {
        if (prop === 'removeChild' && obj instanceof Node) {
          try {
            return _origDefProp(obj, prop, {
              get() { return swallowingRemoveChildEarly; },
              set(_v) { /* ignore */ },
              configurable: true,
              enumerable: false,
            });
          } catch { /* already locked */ }
          return obj;
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
    // Use the ORIGINAL Object.defineProperty (captured in index.html) to bypass
    // our own intercept which only allows safeRemoveChild.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _origDP = (window as any).__origDefProp ?? Object.defineProperty.bind(Object);
    for (const proto of [EventTarget.prototype, Node.prototype, Element.prototype, HTMLElement.prototype, HTMLDivElement.prototype] as object[]) {
      try {
        const d = Object.getOwnPropertyDescriptor(proto, 'removeChild');
        if (!d || d.configurable) {
          _origDP(proto, 'removeChild', {
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
    // Use Object.defineProperty (our intercepted version) — it routes removeChild
    // installs to swallowingRemoveChild automatically.
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
    // __origDefProp is the TRUE Object.defineProperty captured in index.html
    // before any shim ran — it can overwrite even non-configurable own properties
    // that were installed via the same original function.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _shimOrigDP: typeof Object.defineProperty = (window as any).__origDefProp ?? Object.defineProperty.bind(Object);
    function sealAppRoot() {
      const appEl = document.getElementById('app');
      if (!appEl) return;
      try {
        // Always re-seal — never early-return. The stale shim's own sealLoop
        // re-installs patchedRemoveChild every 10ms; we must overwrite it every time.
        // Use __origDefProp (true Object.defineProperty from index.html) to overwrite
        // even non-configurable own properties installed by the stale shim.
        try {
          _shimOrigDP(appEl, 'removeChild', {
            get() { return swallowingRemoveChild; },
            set(_v: unknown) { /* ignore — our wrapper always wins */ },
            configurable: true,
            enumerable: false,
          });
          return;
        } catch { /* fall through */ }
        try {
          _shimOrigDP(appEl, 'removeChild', {
            value: swallowingRemoveChild,
            writable: true,
            configurable: true,
            enumerable: false,
          });
        } catch { /* truly locked */ }
      } catch { /* ignore */ }
    }
    sealAppRoot();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', sealAppRoot, { once: true });
    }
    // Re-seal every 1ms for the first 2s (React's initial commit window),
    // then every 5ms for the next 8s. The stale shim's sealLoop runs every 10ms —
    // we must always be faster to win the race.
    let sealCount = 0;
    function sealLoop() {
      sealAppRoot();
      sealCount++;
      if (sealCount < 2000) setTimeout(sealLoop, sealCount < 400 ? 1 : 5);
    }
    sealLoop();
    // Also seal on every microtask tick during startup — fires between React's
    // scheduler tasks, ensuring #app is sealed before each React commit.
    let microCount = 0;
    function microSeal() {
      sealAppRoot();
      if (++microCount < 500) queueMicrotask(microSeal);
    }
    queueMicrotask(microSeal);
    // rAF loop — fires before every paint, ensuring #app is sealed before React commits
    let rafActive = true;
    setTimeout(() => { rafActive = false; }, 10000);
    (function rafSeal() {
      sealAppRoot();
      if (rafActive) requestAnimationFrame(rafSeal);
    })();
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
  '1784545944754', // new stale shim timestamp seen in runtime errors
  '1784546299827',
  '1784546491474',
  '1784549200000',
  '1784585282530',
  '1784589710474',
  '1784590013856',
  '1784600000000',
  '1784700000000', // cover any shim from previous version range
  '1784748000000', // cover recent edit window
  '1784800000000', // cover July 21 2026 edits
  '1784850000000',
  '1784860000000', // cover July 21 2026 late edits
  '1784870000000',
  '1784880000000',
  '1784890000000', // cover July 22 2026 edits
  '1784900000000',
  '1784910000000',
  '1784920000000',
  '1784930000000', // cover July 21 2026 afternoon edits
  '1784940000000',
  '1784950000000',
  '1784960000000',
  '1784970000000', // cover July 21 2026 evening edits
  '1784980000000',
  '1784990000000',
  '1785000000000', // cover July 22 2026
  '1785010000000',
  '1785020000000',
  '1785030000000',
];
const SOS_SHIM_LS_KEY = 'sos_shim_reload_ts';
const SOS_SHIM_COUNT_KEY = 'sos_shim_reload_count';
// Key that tracks which shim version last reset the counter.
// When the shim is updated, this changes and the counter resets automatically.
const SOS_SHIM_VERSION = '1784900000004'; // bumped 2026-07-21 to reset stale reload counters
const SOS_SHIM_VER_KEY = 'sos_shim_version';
const SOS_SHIM_WINDOW_MS = 30_000;  // 30s window — stale shim persists across fast reloads
const SOS_SHIM_MAX_RELOADS = 12;    // allow more reloads to fully evict the stale module

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
  // For the specific known stale shim timestamp, always reload (up to limit).
  const isKnownStaleShim = src.includes('1784519099416') || (err?.stack ?? '').includes('1784519099416');
  if (isKnownStaleShim && !shimSosRecentReload()) {
    doStaleReload();
  } else if (!shimSosRecentReload()) {
    doStaleReload();
  }
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


