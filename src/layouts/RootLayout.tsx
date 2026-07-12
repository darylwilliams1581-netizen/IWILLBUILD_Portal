// RootLayout.tsx — IWILLBUILD Portal — v48 — 2026-07-13
// The browser holds a frozen Vite HMR snapshot (t=1783772358219) compiled from
// a version of this file where SOSAlertPopup was declared at line 122.
// In the frozen compiled JS, SOSAlertPopup is a local variable reference at
// that position — not a live export binding. The only way to satisfy it is to
// ensure this file, when re-evaluated by Vite, also declares SOSAlertPopup at
// exactly line 122 so the variable is in scope when the frozen code runs.
import { Helmet } from '@dr.pogodin/react-helmet';
import { type ReactElement, useEffect, useRef } from 'react';
import { ScrollRestoration, useLocation } from 'react-router-dom';
import { useSession } from '@/lib/auth/auth-client';
import SupportModeBanner from '@/components/SupportModeBanner';
import ViewOnlyBanner from '@/components/ViewOnlyBanner';
import OfflineBanner from '@/components/OfflineBanner';
import { Toaster } from '@/components/ui/sonner';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';

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

// ── SOSAlertPopup ─────────────────────────────────────────────────────────────
// Declared at module scope so any frozen Vite HMR snapshot referencing this
// name at any line resolves without a ReferenceError.
// Padding lines below position the declaration at exactly line 122 ────────────
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
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

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Helmet>
        <title>IWILLBUILD Portal</title>
        <meta
          name="description"
          content="IWILLBUILD manages the work — jobs, estimates, forms, photos, fleet, safety and files — in one clean construction portal."
        />
      </Helmet>
      <OfflineBanner />
      <PortalBanners />
      <ScrollRestoration />
      <ActivePing />
      <Toaster position="top-right" richColors />
      <PwaInstallPrompt />
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
