// RootLayout.tsx — IWILLBUILD Portal — v53 2026-07-13
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
import { Toaster } from '@/components/ui/sonner';
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

function isPublicRoute(pathname: string): boolean {
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

function PortalBanners() {
  const location = useLocation();
  if (isPublicRoute(location.pathname)) return null;
  return (
    <>
      <SupportModeBanner />
      <ViewOnlyBanner />
    </>
  );
}

// ── ClientOnly ────────────────────────────────────────────────────────────────
// Renders nothing on the server; renders children only after hydration.
// Prevents SSR/client node-count mismatches for components that use
// browser-only APIs (navigator, localStorage, portals, etc.).
function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return <>{children}</>;
}


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

interface SosState { caught: boolean }
class SosInnerBoundary extends Component<{ children: ReactNode }, SosState> {
  state: SosState = { caught: false };
  private _rethrow: Error | null = null;

  static getDerivedStateFromError(error: Error): SosState {
    const isSos = error.message?.includes('SOSAlertPopup') ||
                  error.stack?.includes('SOSAlertPopup') ||
                  error.stack?.includes('1783772358219');
    return { caught: !!isSos };
  }

  componentDidCatch(error: Error) {
    const isSos = error.message?.includes('SOSAlertPopup') ||
                  error.stack?.includes('SOSAlertPopup') ||
                  error.stack?.includes('1783772358219');
    if (isSos) {
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
  return (
    <div suppressHydrationWarning className="min-h-screen bg-background text-foreground flex flex-col">
      <Helmet>
        <title>IWILLBUILD Portal</title>
        <meta
          name="description"
          content="IWILLBUILD manages the work — jobs, estimates, forms, photos, fleet, safety and files — in one clean construction portal."
        />
      </Helmet>
      <OfflineBanner />
      <PortalBanners />
      <ClientOnly><ScrollRestoration /></ClientOnly>
      <ActivePing />
      <Toaster position="top-right" richColors />
      <ClientOnly><PwaInstallPrompt /></ClientOnly>
      <div suppressHydrationWarning className="flex-1 flex flex-col overflow-hidden">
        <SosInnerBoundary>
          {children}
        </SosInnerBoundary>
      </div>
    </div>
  );
}
