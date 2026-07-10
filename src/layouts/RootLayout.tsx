import { Helmet } from '@dr.pogodin/react-helmet';
import { type ReactElement, useEffect, useRef } from 'react';
import { ScrollRestoration, useLocation } from 'react-router-dom';
import { useSession } from '@/lib/auth/auth-client';
import SupportModeBanner from '@/components/SupportModeBanner';
import ViewOnlyBanner from '@/components/ViewOnlyBanner';
import OfflineBanner from '@/components/OfflineBanner';
import { Toaster } from '@/components/ui/sonner';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';

/**
 * Root layout for IWILLBUILD Portal — fullscreen dashboard app.
 * No shared header/footer; each page manages its own layout.
 */
interface RootLayoutProps {
  children: ReactElement;
}

/**
 * Public auth routes that must never trigger portal API calls.
 * These pages render without a session and must not mount any
 * component that fetches /api/me, /api/subscription/status, etc.
 */
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
  // Exact match or prefix match (e.g. /reset-password/token123)
  if (PUBLIC_ROUTES.has(pathname)) return true;
  for (const route of PUBLIC_ROUTES) {
    if (pathname.startsWith(route + '/')) return true;
  }
  return false;
}

/** Sends a lightweight ping to update last_active_at. Fires on mount and every 2 minutes. */
function ActivePing() {
  const { user } = useSession();
  const location = useLocation();
  const lastPingRef = useRef<number>(0);

  // Never ping on public auth pages
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

/** Portal-only banners — only mounted when the user is on a protected route. */
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

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Helmet>
        <title>IWILLBUILD Portal</title>
        <meta name="description" content="IWILLBUILD manages the work — jobs, estimates, forms, photos, fleet, safety and files — in one clean construction portal." />
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
