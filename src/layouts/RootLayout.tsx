// RootLayout.tsx — IWIllBUILD Portal
import { Helmet } from '@dr.pogodin/react-helmet';
import { type ReactElement, type ReactNode, useEffect, useState } from 'react';
import { ScrollRestoration, useLocation } from "react-router";
import { useSession } from '@/lib/auth/auth-client';
import SupportModeBanner from '@/components/SupportModeBanner';
import ViewOnlyBanner from '@/components/ViewOnlyBanner';
import OfflineBanner from '@/components/OfflineBanner';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';
import { DocumentActionsProvider } from '@/lib/document-actions-context';
import DocumentActionsWidget from '@/components/DocumentActionsWidget';
import { useRef } from 'react';
import { recordRouteChange } from '@/lib/diagnosticCapture';

// ── Types ─────────────────────────────────────────────────────────────────────
interface RootLayoutProps {
  children: ReactElement;
}

const PUBLIC_ROUTES = new Set(['/', '/login', '/signup', '/check-email', '/verify-email', '/verify-required', '/forgot-password', '/reset-password']);

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
    void fetch('/api/active-ping', {
      method: 'POST',
      credentials: 'include'
    }).catch(() => {});
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
// match exactly at hydration time.
function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) {
    // eslint-disable-next-line react/no-danger
    return <div data-client-only dangerouslySetInnerHTML={{ __html: '' }} />;
  }
  return <div data-client-only>{children}</div>;
}

// DeferredMount is an alias kept for backwards compat with existing usages.
const DeferredMount = ClientOnly;

export default function RootLayout({ children }: RootLayoutProps) {
  const location = useLocation();

  // Route change tracking — placed here so it has router context on both
  // client and server (server is a no-op since recordRouteChange is client-only).
  useEffect(() => {
    recordRouteChange(location.pathname);
  }, [location.pathname]);

  return (
    <div suppressHydrationWarning className="h-full bg-background text-foreground flex flex-col">
      <Helmet>
        <title>IWIllBUILD Portal</title>
        <meta name="description" content="IWIllBUILD manages the work — jobs, estimates, forms, photos, fleet, safety and files — in one clean construction portal." />
      </Helmet>
      <ScrollRestoration />
      {/*
        ActivePing, PortalBanners, and DocumentActionsWidget all use auth hooks
        (useSession, usePermissions, useSubscriptionGate) that read cookies /
        localStorage on the client but return empty on the server. Wrapping them
        in ClientOnly means the server renders an empty placeholder div and the
        client renders the same empty div during hydration — no mismatch.
        After the first paint, ClientOnly swaps in the real children.
      */}
      <ClientOnly>
        <ActivePing />
        <PortalBanners pathname={location.pathname} />
      </ClientOnly>
      <DeferredMount>
        <OfflineBanner />
        <PwaInstallPrompt />
      </DeferredMount>
      <DocumentActionsProvider>
        <div suppressHydrationWarning className="flex-1 min-h-0 flex flex-col" style={{ overflowX: 'clip' }}>
          {children}
        </div>
        {/* Global Document Actions floating widget — hidden on public/share pages */}
        <ClientOnly>
          <DocumentActionsWidget />
        </ClientOnly>
      </DocumentActionsProvider>
    </div>
  );
}
