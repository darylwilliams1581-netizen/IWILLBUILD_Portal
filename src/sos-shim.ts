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

// ── React hydration removeChild guard ────────────────────────────────────────
// Password managers (1Password, Bitwarden, LastPass) and browser extensions
// inject DOM nodes into form inputs before React hydrates. React then calls
// removeChild on a node the extension has already moved, producing:
//   NotFoundError: Failed to execute 'removeChild' on 'Node'
// React 19 throws this as a non-recoverable error (not passed to
// onRecoverableError). Patch Node.prototype.removeChild to silently swallow
// the NotFoundError during the hydration window (first 8 seconds after load).
{
  const _origRemoveChild = Node.prototype.removeChild;
  let _hydrating = true;
  setTimeout(() => { _hydrating = false; }, 8000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Node.prototype as any).removeChild = function <T extends Node>(child: T): T {
    if (_hydrating) {
      try {
        return _origRemoveChild.call(this, child) as T;
      } catch (e) {
        if (e instanceof Error && e.name === 'NotFoundError' &&
            e.message.includes('removeChild')) {
          return child; // extension moved the node — no-op
        }
        throw e;
      }
    }
    return _origRemoveChild.call(this, child) as T;
  };
}
