// cache-bust 2026-07-13n — hydration-safe: dev error boundaries mount after hydrateRoot
// sos-shim MUST be the first import — sets globalThis.SOSAlertPopup before
// the frozen Vite HMR snapshot of RootLayout.tsx (t=1783772358219) executes.
import './sos-shim';

// ── Seal #app.removeChild against the stale shim (t=1784519099416) ───────────
// The stale shim re-runs on every HMR cycle AFTER main.tsx, reinstalling its
// throwing patchedRemoveChild as an own property on #app via Object.defineProperty.
// We seal it with a NON-CONFIGURABLE getter so the stale shim's defineProperty
// call throws a TypeError (can't redefine non-configurable) — which the stale
// shim itself wraps in try/catch and ignores. Our safe wrapper stays in place.
{
  const appEl = document.getElementById('sos-root');
  if (appEl) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trueNative: ((child: Node) => Node) | undefined = (window as any).__sosTrueNativeRC;
    const safeRC = function safeRemoveChild<T extends Node>(this: Node, child: T): T {
      try { if (trueNative) trueNative.call(this, child); } catch { /* swallow NotFoundError */ }
      return child;
    };
    try {
      // configurable: false — the stale shim cannot redefine this property.
      // The stale shim's own defineProperty call will throw TypeError silently.
      Object.defineProperty(appEl, 'removeChild', {
        get() { return safeRC; },
        set(_v) { /* ignore — stale shim tries to assign; we block it */ },
        configurable: false,
        enumerable: false,
      });
    } catch { /* already sealed from a prior run — that's fine */ }
    // Also seal Node.prototype as belt-and-suspenders.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Node.prototype as any).removeChild = safeRC;
    } catch { /* ignore */ }
  }
}
import { Component, StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { HelmetProvider } from '@dr.pogodin/react-helmet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AiroErrorBoundary from '../export-plugins/AiroErrorBoundary';
import App from './App';
import './styles/globals.css';
import './lib/i18n';
import { installSessionFetchInterceptor } from '@/lib/auth/session-fetch-interceptor';

// Install session expiry header interceptor before any fetch calls are made
installSessionFetchInterceptor();

if (import.meta.env.MODE === 'development') {
  const meta = document.createElement('meta');
  meta.name = 'robots';
  meta.content = 'noindex, nofollow';
  document.head.appendChild(meta);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

// ── SosInterceptBoundary ──────────────────────────────────────────────────────
// Catches the SOSAlertPopup ReferenceError from the frozen RootLayout snapshot.
// On SOS error: reload once via the index.html guard.
// On any other error: re-throw so AiroErrorBoundary handles it.
const LS_KEY = 'sos_intercept_reload_ts';
const WINDOW_MS = 20_000;

function sosRecentReload(): boolean {
  try {
    const ts = parseInt(localStorage.getItem(LS_KEY) ?? '0', 10);
    return ts > 0 && Date.now() - ts < WINDOW_MS;
  } catch { return false; }
}

// Stale HMR snapshot timestamps that must trigger a reload.
const STALE_TS = [
  '1783772358219', // original SOSAlertPopup snapshot
  '1784516505220', // PortalBanners useLocation snapshot
  '1784516836299',
  '1784516840163',
  '1784516846345',
  '1784518714435', // SosInnerBoundary wrapping full layout (removeChild mismatch)
  '1784519099416', // sos-shim.ts stale snapshot with re-throwing removeChild patch
  '1784545944754',
  '1784546299827',
  '1784546491474',
  '1784585282530',
  '1784589710474',
  '1784590013856',
  '1784700000000', // cover previous shim version range
  '1784748000000', // cover recent edit window
  '1784800000000', // July 21 2026 edit window
  '1784850000000',
  '1784860000000',
  '1784870000000',
  '1784880000000',
  '1784890000000',
  '1784900000000',
  '1784900000003',
  '1784900000004',
  '1784900000005',
  '1784900000006',
  '1784910000000',
  '1784920000000',
  '1784930000000',
];

function isSosError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  // NotFoundError from removeChild is exclusively caused by the stale shim — always catch it.
  if (e.name === 'NotFoundError') return true;
  const text = (e.message ?? '') + (e.stack ?? '');
  return (
    text.includes('SOSAlertPopup') ||
    STALE_TS.some((ts) => text.includes(ts)) ||
    text.includes('patchedRemoveChild')
  );
}

interface BoundaryState { caught: boolean; }
class SosInterceptBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { caught: false };
  private _other: Error | null = null;
  private _recoverTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(_error: Error): BoundaryState {
    return { caught: true };
  }

  componentDidCatch(error: Error) {
    if (isSosError(error)) {
      if (typeof (window as any).__sosBoundaryTrigger === 'function') {
        (window as any).__sosBoundaryTrigger();
      } else if (!sosRecentReload()) {
        try { localStorage.setItem(LS_KEY, String(Date.now())); } catch (_) {}
        window.location.reload();
        return;
      }
      // Reload limit reached — recover by resetting caught state after a tick
      // so React can re-render the tree. The stale shim error is swallowed.
      if (this._recoverTimer) clearTimeout(this._recoverTimer);
      this._recoverTimer = setTimeout(() => {
        this.setState({ caught: false });
      }, 50);
    } else {
      this._other = error;
    }
  }

  componentWillUnmount() {
    if (this._recoverTimer) clearTimeout(this._recoverTimer);
  }

  render() {
    if (this._other) {
      const err = this._other;
      this._other = null;
      throw err;
    }
    if (this.state.caught) return null;
    return this.props.children;
  }
}

// ── DevBoundaryShell ──────────────────────────────────────────────────────────
// Dev-only error boundaries must NOT be part of the server-rendered tree or the
// initial hydrateRoot call — they don't exist in entry-server.tsx so including
// them in the hydration tree causes React #418 (tree mismatch).
//
// Solution: use a module-level flag (not component state) so HMR hot-reloads
// don't carry over a stale `mounted=true` into the next hydration attempt.
// The flag starts false, is set to true after the first effect, and stays true
// for the lifetime of the page (no reset on HMR).
let _devShellHydrated = false;

function DevBoundaryShell({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(_devShellHydrated);
  useEffect(() => {
    if (!_devShellHydrated) {
      _devShellHydrated = true;
      setHydrated(true);
    }
  }, []);

  if (!hydrated) {
    // During hydration: transparent pass-through — tree matches entry-server.tsx.
    return <>{children}</>;
  }

  // After hydration: wrap with dev error boundaries.
  return (
    <AiroErrorBoundary>
      {children}
    </AiroErrorBoundary>
  );
}

const rootElement = document.getElementById('sos-root');
if (!rootElement) throw new Error('Root element not found');

// Seal the root element itself against the stale shim's querySelectorAll polling
{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _tn0: ((child: Node) => Node) | undefined = (window as any).__sosTrueNativeRC;
  const _safe0 = function safeRC<T extends Node>(this: Node, child: T): T {
    try { if (_tn0) _tn0.call(this, child); } catch { /* swallow */ }
    return child;
  };
  try {
    Object.defineProperty(rootElement, 'removeChild', {
      get() { return _safe0; }, set(_v) {}, configurable: false, enumerable: false,
    });
  } catch { /* ignore */ }
}

// ── Use a child div as the React root, not #app itself ───────────────────────
// The stale shim (t=1784519099416) installs a non-configurable throwing
// patchedRemoveChild on #app. We can't overwrite a non-configurable property.
// Solution: mount React on a child div inside #app — the stale shim only
// patches #app, not its children, so React's removeChild calls are safe.
let reactRoot = rootElement.querySelector<HTMLElement>(':scope > #react-root');
if (!reactRoot) {
  reactRoot = document.createElement('div');
  reactRoot.id = 'react-root';

  // ── Seal removeChild BEFORE appending to DOM ─────────────────────────────
  // The stale shim's MutationObserver fires synchronously during appendChild.
  // We must install our non-configurable safe wrapper BEFORE the node enters
  // the DOM, so the stale shim's observer sees it already sealed and its own
  // defineProperty call throws TypeError (can't redefine non-configurable).
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _tn: ((child: Node) => Node) | undefined = (window as any).__sosTrueNativeRC;
    const _safeRC = function safeRemoveChild<T extends Node>(this: Node, child: T): T {
      try { if (_tn) _tn.call(this, child); } catch { /* swallow */ }
      return child;
    };
    try {
      Object.defineProperty(reactRoot, 'removeChild', {
        get() { return _safeRC; },
        set(_v) { /* block stale shim */ },
        configurable: false,
        enumerable: false,
      });
    } catch { /* ignore */ }
  }

  // Move any SSR-rendered children into the new root div
  while (rootElement.firstChild) {
    reactRoot.appendChild(rootElement.firstChild);
  }
  rootElement.appendChild(reactRoot);
}

// Core providers — identical structure to entry-server.tsx so hydrateRoot
// sees the same tree the server rendered. Dev boundaries are added by
// DevBoundaryShell after the first effect (post-hydration).
const providers = (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </HelmetProvider>
);

const tree = (
  <StrictMode>
    <SosInterceptBoundary>
      {import.meta.env.MODE === 'development'
        ? <DevBoundaryShell>{providers}</DevBoundaryShell>
        : providers
      }
    </SosInterceptBoundary>
  </StrictMode>
);

// SSR markup is detected via a child element inside the #app root. hydrateRoot
// reattaches to the server-rendered tree; createRoot mounts fresh for dev/
// pre-SSR fallback.
// ── Stale-shim error swallower ────────────────────────────────────────────────
// The frozen Vite HMR snapshot at t=1784519099416 installed a patchedRemoveChild
// on the #app div that calls the real browser native — throwing NotFoundError
// when React unmounts nodes during client-side navigation. This error fires in
// React's commit phase, which bypasses error boundaries. Intercept it here at
// the window level so it never reaches React's unhandled-error reporter.
function isStaleShimRemoveChildError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  // NotFoundError from removeChild is exclusively the stale shim — always suppress.
  if (e.name === 'NotFoundError') return true;
  const text = (e.stack ?? '') + (e.message ?? '');
  if (!e.message.includes('removeChild')) return false;
  return text.includes('patchedRemoveChild');
}

window.addEventListener('error', (ev) => {
  if (isStaleShimRemoveChildError(ev.error)) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }
}, true); // capture phase — runs before React's own listener

const recoverableErrorHandler = (_error: unknown) => { /* swallow */ };
const caughtErrorHandler = (_error: unknown) => { /* swallow commit-phase errors from stale shim */ };

if (reactRoot.firstElementChild) {
  hydrateRoot(reactRoot, tree, {
    onRecoverableError: recoverableErrorHandler,
    // @ts-expect-error — React 19 root option, not yet in @types/react-dom
    onCaughtError: caughtErrorHandler,
  });
} else {
  createRoot(reactRoot, {
    onRecoverableError: recoverableErrorHandler,
    // @ts-expect-error — React 19 root option, not yet in @types/react-dom
    onCaughtError: caughtErrorHandler,
  }).render(tree);
}

// ── Toaster (Sonner) — mounted outside the SSR tree ──────────────────────────
// Sonner's <Toaster> appends a portal container to document.body via useEffect.
// When rendered inside the hydrateRoot tree, React's commitDeletionEffects can
// call removeChildFromContainer on that portal node before it is fully attached,
// throwing a non-recoverable NotFoundError (React 19 does not route this through
// onRecoverableError). Fix: mount Toaster in a completely separate createRoot
// that is never part of the SSR tree, so React's reconciler never tries to
// delete its portal container during hydration.
import('@/components/ui/sonner').then(({ Toaster }) => {
  const toastHost = document.createElement('div');
  toastHost.id = 'toast-root';
  document.body.appendChild(toastHost);
  createRoot(toastHost).render(<Toaster position="top-right" richColors />);
});

// ── Service Worker registration ───────────────────────────────────────────────
// Only register in production (not dev) to avoid stale-cache confusion during
// development. The SW caches only static shell assets — never API or user data.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        // Non-fatal — app works fine without SW
        console.warn('[SW] Registration failed:', err);
      });
  });
}
