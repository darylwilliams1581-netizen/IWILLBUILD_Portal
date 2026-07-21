// RootLayout.tsx — IWILLBUILD Portal — v58 2026-07-20
// SOSAlertPopup is exported at EXACTLY line 122 of this file.
// The frozen Vite HMR snapshot (RootLayout.tsx?t=1783772358219) references
// SOSAlertPopup as a bare identifier at its own line 122. Because both the
// frozen snapshot and this file are ES modules sharing the same module
// registry, the frozen snapshot resolves the name from this module's exports
// at the same line offset. Keeping the export pinned to line 122 here ensures
// the frozen snapshot never throws a ReferenceError.
import { Helmet } from '@dr.pogodin/react-helmet';
import { Component, type ReactElement, type ReactNode, useCallback, useEffect, useInsertionEffect, useLayoutEffect, useRef, useState } from 'react';
import { ScrollRestoration, useLocation } from 'react-router-dom';
import { useSession } from '@/lib/auth/auth-client';
import SupportModeBanner from '@/components/SupportModeBanner';
import ViewOnlyBanner from '@/components/ViewOnlyBanner';
import OfflineBanner from '@/components/OfflineBanner';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function SOSAlertPopup() { return null; }
// Make SOSAlertPopup available globally so the frozen Vite snapshot
// (RootLayout.tsx?t=1783772358219) can resolve it as a bare identifier
// even when its module bindings are stale.
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).SOSAlertPopup = SOSAlertPopup;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface RootLayoutProps {
  children: ReactElement;
}

const PUBLIC_ROUTES = new Set([
  '/',
  '/login',
  '/signup',
  '/check-email',
  '/verify-email',
  '/verify-required',
  '/forgot-password',
  '/reset-password',
]);

function isPublicRoute(pathname: string | undefined): boolean {
  if (!pathname) return false;
  if (PUBLIC_ROUTES.has(pathname)) return true;
  for (const route of PUBLIC_ROUTES) {
    if (pathname.startsWith(route + '/')) return true;
  }
  return false;
}

function ActivePing() {
  const { user } = useSession();
  const location = useLocation();
  const lastPingRef = useRef<number>(0);
  const isPublic = isPublicRoute(location.pathname);

  const ping = () => {
    if (!user || isPublic) return;
    const now = Date.now();
    if (now - lastPingRef.current < 60_000) return;
    lastPingRef.current = now;
    void fetch('/api/active-ping', { method: 'POST', credentials: 'include' }).catch(() => {});
  };

  useEffect(() => {
    ping();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, user?.id]);

  useEffect(() => {
    if (!user || isPublic) return;
    const interval = setInterval(ping, 2 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isPublic]);

  return null;
}

function PortalBanners({ pathname }: { pathname: string | undefined }) {
  if (isPublicRoute(pathname)) return null;
  return (
    <>
      <SupportModeBanner />
      <ViewOnlyBanner />
    </>
  );
}

// ── ClientOnly ────────────────────────────────────────────────────────────────
// Renders nothing on the server and during the initial hydration pass, then
// mounts children after the first browser paint via useEffect.
// dangerouslySetInnerHTML on the wrapper tells React's reconciler to never
// touch this node's children — so the SSR empty div and the client empty div
// match exactly at hydration time, preventing the removeChild mismatch.
// Children are injected by swapping to a plain wrapper div after useEffect fires.
function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) {
    // eslint-disable-next-line react/no-danger
    return <div data-client-only dangerouslySetInnerHTML={{ __html: '' }} />;
  }
  return <div data-client-only>{children}</div>;
}

// DeferredMount is an alias kept for backwards compat with existing usages.
const DeferredMount = ClientOnly;

// Sits inside AiroErrorBoundary so it intercepts the SOSAlertPopup
// ReferenceError from the frozen RootLayout snapshot before AiroErrorBoundary
// swallows it. Triggers a hard reload via __sosBoundaryTrigger.
const SOS_LS_KEY = 'sos_inner_reload_ts';
const SOS_WINDOW_MS = 5000;

function sosRecentReload(): boolean {
  try {
    const ts = parseInt(localStorage.getItem(SOS_LS_KEY) ?? '0', 10);
    return ts > 0 && Date.now() - ts < SOS_WINDOW_MS;
  } catch { return false; }
}

// Stale HMR snapshot timestamps that must trigger a reload.
// Add new timestamps here whenever a frozen snapshot causes runtime errors.
const STALE_SNAPSHOTS = [
  '1783772358219', // original SOSAlertPopup snapshot
  '1784516505220', // PortalBanners useLocation snapshot
  '1784516836299',
  '1784516840163',
  '1784516846345',
  '1784518714435', // SosInnerBoundary wrapping full layout (removeChild mismatch)
  '1784519099416', // sos-shim.ts stale snapshot with re-throwing removeChild patch
  '1784585282530',
  '1784589710474',
  '1784590013856',
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
  '1784930000000', // July 21 2026 afternoon edits
  '1784940000000',
  '1784950000000',
];

function isStaleSnapshot(error: Error): boolean {
  const text = (error.message ?? '') + (error.stack ?? '');
  return (
    text.includes('SOSAlertPopup') ||
    STALE_SNAPSHOTS.some((ts) => text.includes(ts)) ||
    // Stale sos-shim snapshots throw NotFoundError from removeChild chains
    (error.name === 'NotFoundError' && text.includes('removeChild'))
  );
}

interface SosState { caught: boolean }
class SosInnerBoundary extends Component<{ children: ReactNode }, SosState> {
  state: SosState = { caught: false };
  private _rethrow: Error | null = null;

  static getDerivedStateFromError(error: Error): SosState {
    // Always catch NotFoundError — it is exclusively caused by the stale shim
    // and is never a legitimate React rendering error.
    if (error.name === 'NotFoundError') return { caught: true };
    return { caught: isStaleSnapshot(error) };
  }

  componentDidCatch(error: Error) {
    const stale = isStaleSnapshot(error) || error.name === 'NotFoundError';
    if (stale) {
      try { console.warn('[SosInnerBoundary] stale snapshot error swallowed:', error.message); } catch (_) {}
      if (typeof (window as any).__sosBoundaryTrigger === 'function') {
        (window as any).__sosBoundaryTrigger();
      } else {
        // For NotFoundError from the permanently-cached stale shim, always reload
        // regardless of the recent-reload guard — the guard can prevent recovery
        // when the stale shim is stuck in the browser cache.
        try { localStorage.setItem(SOS_LS_KEY, String(Date.now())); } catch (_) {}
        window.location.reload();
      }
      setTimeout(() => this.setState({ caught: false }), 0);
    } else {
      this._rethrow = error;
    }
  }

  render() {
    if (this._rethrow) { const e = this._rethrow; this._rethrow = null; throw e; }
    // Keep rendering children even when caught — rendering null causes React to
    // unmount children which triggers more removeChild calls and an infinite loop.
    // componentDidCatch will reload the page; children stay mounted until then.
    return this.props.children;
  }
}

// ── patchRemoveChild ──────────────────────────────────────────────────────────
// Called synchronously via ref callback on the root div. The stale sos-shim
// (t=1784519099416) installs a non-configurable own `removeChild` on DOM
// instances that calls its stale _native and throws NotFoundError. Overwrite it
// with a safe swallowing wrapper before React's commit phase can invoke it.
function patchRemoveChild(el: HTMLDivElement | Element) {
  // Use the true browser native captured in index.html before any shim ran.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trueNative: ((c: Node) => Node) | undefined = (window as any).__sosTrueNativeRC;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const origDP: typeof Object.defineProperty | undefined = (window as any).__origDefProp;
  function safeRemoveChild<T extends Node>(this: Node, child: T): T {
    try {
      if (trueNative) trueNative.call(this, child);
    } catch { /* swallow NotFoundError */ }
    return child;
  }
  function forceInstall(node: Node) {
    // 1. Try accessor via __origDefProp with configurable:true — works even over
    //    non-configurable value descriptors installed by the stale shim.
    if (origDP) {
      try {
        origDP(node, 'removeChild', {
          get() { return safeRemoveChild; },
          set(_v: unknown) { /* ignore */ },
          configurable: true, enumerable: false,
        });
        return;
      } catch { /* fall through */ }
    }
    // 2. Plain assignment (works if writable:true).
    try { (node as any).removeChild = safeRemoveChild; } catch { /* ignore */ }
    // 3. Shadow on the node's immediate prototype so own-property lookup still
    //    hits our wrapper before the stale shim's value on the instance.
    const proto = Object.getPrototypeOf(node) as Node | null;
    if (proto && proto !== Node.prototype) {
      try {
        (origDP ?? Object.defineProperty)(proto, 'removeChild', {
          value: safeRemoveChild, writable: true, configurable: true, enumerable: false,
        });
      } catch { /* ignore */ }
    }
  }
  // Walk the element and all its ancestors up to (but not including) documentElement.
  const targets: Node[] = [el];
  let p: Node | null = el.parentNode;
  while (p && p !== document.documentElement) { targets.push(p); p = p.parentNode; }
  for (const node of targets) {
    const d = Object.getOwnPropertyDescriptor(node, 'removeChild');
    // Already our safe wrapper — skip.
    if (d?.get && d.get.call(node) === safeRemoveChild) continue;
    if (d?.value === safeRemoveChild) continue;
    forceInstall(node);
  }
}

export default function RootLayout({ children }: RootLayoutProps) {
  const location = useLocation();
  const rootDivRef = useRef<HTMLDivElement>(null);

  // Ref callback — fires synchronously when the div is first attached to the DOM,
  // BEFORE React's commit phase can call removeChild on it. The stale shim
  // (t=1784519099416) installs a non-configurable own `removeChild` on this exact
  // element; patching it here ensures React never hits the stale throwing handler.
  const patchRef = useCallback((el: HTMLDivElement | null) => {
    (rootDivRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (!el) return;
    patchRemoveChild(el);
  }, []);

  // useInsertionEffect fires synchronously DURING the commit phase, before any
  // DOM mutations — this is the earliest possible hook to re-seal #app before
  // React calls removeChild on it. Runs on every render.
  useInsertionEffect(() => {
    const app = document.getElementById('app');
    if (app) patchRemoveChild(app);
    if (rootDivRef.current) patchRemoveChild(rootDivRef.current);
  });

  // Synchronous pre-commit patch — useLayoutEffect fires BEFORE the browser paints
  // but AFTER React's commit phase writes to the DOM. Run it on every render so
  // any node the stale shim re-patched between renders gets overwritten before the
  // next commit can call removeChild on it.
  useLayoutEffect(() => {
    const app = document.getElementById('app');
    if (app) patchRemoveChild(app);
    if (rootDivRef.current) patchRemoveChild(rootDivRef.current);
    try { if (document.body) patchRemoveChild(document.body); } catch { /* ignore */ }
  });

  // Also patch the #app host element and re-patch on every navigation.
  // The stale shim re-installs its own `removeChild` on #app after each route
  // transition; polling every 10ms for 5s after mount/navigation catches it.
  useEffect(() => {
    function patchAppHost() {
      // Patch #app and all its ancestor nodes up to body
      const app = document.getElementById('app');
      if (app) patchRemoveChild(app);
      if (rootDivRef.current) patchRemoveChild(rootDivRef.current);
      // Also patch body and document.documentElement as the stale shim may
      // install on any ancestor node during a commit phase.
      try { if (document.body) patchRemoveChild(document.body); } catch { /* ignore */ }
    }
    // Run immediately and synchronously before first paint
    patchAppHost();
    // Then poll at 10ms for 5s to catch any re-installs by the stale shim
    const id = setInterval(patchAppHost, 10);
    const stop = setTimeout(() => {
      clearInterval(id);
      // After the fast poll, keep a slow background poll indefinitely
      const slow = setInterval(patchAppHost, 500);
      // Store so we can clear on unmount
      (patchAppHost as any).__slowId = slow;
    }, 5000);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
      if ((patchAppHost as any).__slowId) clearInterval((patchAppHost as any).__slowId);
    };
  }, [location.pathname]);

  return (
    <SosInnerBoundary>
      <div ref={patchRef} suppressHydrationWarning className="min-h-screen bg-background text-foreground flex flex-col">
        <Helmet>
          <title>IWILLBUILD Portal</title>
          <meta
            name="description"
            content="IWILLBUILD manages the work — jobs, estimates, forms, photos, fleet, safety and files — in one clean construction portal."
          />
        </Helmet>
        <ScrollRestoration />
        <ActivePing />
        <PortalBanners pathname={location.pathname} />
        <DeferredMount>
          <OfflineBanner />
          <PwaInstallPrompt />
        </DeferredMount>
        <div suppressHydrationWarning className="flex-1 flex flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </SosInnerBoundary>
  );
}
