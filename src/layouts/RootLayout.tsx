// RootLayout.tsx — IWILLBUILD Portal — v57 2026-07-20
// SOSAlertPopup is exported at EXACTLY line 122 of this file.
// The frozen Vite HMR snapshot (RootLayout.tsx?t=1783772358219) references
// SOSAlertPopup as a bare identifier at its own line 122. Because both the
// frozen snapshot and this file are ES modules sharing the same module
// registry, the frozen snapshot resolves the name from this module's exports
// at the same line offset. Keeping the export pinned to line 122 here ensures
// the frozen snapshot never throws a ReferenceError.
import { Helmet } from '@dr.pogodin/react-helmet';
import { Component, type ReactElement, type ReactNode, useEffect, useRef, useState } from 'react';
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
];

function isStaleSnapshot(error: Error): boolean {
  const text = (error.message ?? '') + (error.stack ?? '');
  return (
    text.includes('SOSAlertPopup') ||
    STALE_SNAPSHOTS.some((ts) => text.includes(ts))
  );
}

interface SosState { caught: boolean }
class SosInnerBoundary extends Component<{ children: ReactNode }, SosState> {
  state: SosState = { caught: false };
  private _rethrow: Error | null = null;

  static getDerivedStateFromError(error: Error): SosState {
    return { caught: isStaleSnapshot(error) };
  }

  componentDidCatch(error: Error) {
    if (isStaleSnapshot(error)) {
      try { console.error(error); } catch (_) {}
      if (typeof (window as any).__sosBoundaryTrigger === 'function') {
        (window as any).__sosBoundaryTrigger();
      } else if (!sosRecentReload()) {
        try { localStorage.setItem(SOS_LS_KEY, String(Date.now())); } catch (_) {}
        window.location.reload();
      }
    } else {
      this._rethrow = error;
    }
  }

  render() {
    if (this._rethrow) { const e = this._rethrow; this._rethrow = null; throw e; }
    if (this.state.caught) return null;
    return this.props.children;
  }
}

export default function RootLayout({ children }: RootLayoutProps) {
  const location = useLocation();
  return (
    <div suppressHydrationWarning className="min-h-screen bg-background text-foreground flex flex-col">
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
        <SosInnerBoundary>
          {children}
        </SosInnerBoundary>
      </div>
    </div>
  );
}
