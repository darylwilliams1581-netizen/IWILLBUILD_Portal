// RootLayout — IWILLBUILD Portal — v32 — 2026-07-13 — sos-inline-canonical
// SOSAlertPopup defined at module scope so any frozen Vite HMR snapshot
// that references it as a free variable at line 122 resolves cleanly.
import { Helmet } from '@dr.pogodin/react-helmet';
import { type ReactElement, useEffect, useRef } from 'react';
import { ScrollRestoration, useLocation } from 'react-router-dom';
import { useSession } from '@/lib/auth/auth-client';
import SupportModeBanner from '@/components/SupportModeBanner';
import ViewOnlyBanner from '@/components/ViewOnlyBanner';
import OfflineBanner from '@/components/OfflineBanner';
import { Toaster } from '@/components/ui/sonner';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';

// ── SOSAlertPopup shim ────────────────────────────────────────────────────────
// The old RootLayout.tsx (t=1783772358219) referenced this symbol at line 122.
// Defining it here means the frozen snapshot resolves it without a ReferenceError.
function SOSAlertPopup() { return null; }

// ── Layout ────────────────────────────────────────────────────────────────────
interface RootLayoutProps { children: ReactElement; }

const PUBLIC_ROUTES = new Set(['/', '/login', '/signup', '/check-email',
  '/verify-email', '/verify-required', '/forgot-password', '/reset-password']);

function isPublicRoute(p: string) {
  if (PUBLIC_ROUTES.has(p)) return true;
  for (const r of PUBLIC_ROUTES) if (p.startsWith(r + '/')) return true;
  return false;
}

function ActivePing() {
  const { user } = useSession();
  const location = useLocation();
  const lastRef = useRef<number>(0);
  const isPublic = isPublicRoute(location.pathname);
  const ping = () => {
    if (!user || isPublic) return;
    const now = Date.now();
    if (now - lastRef.current < 60_000) return;
    lastRef.current = now;
    void fetch('/api/active-ping', { method: 'POST', credentials: 'include' }).catch(() => {});
  };
  useEffect(() => { ping(); }, [location.pathname, user?.id]); // eslint-disable-line
  useEffect(() => {
    if (!user || isPublic) return;
    const t = setInterval(ping, 2 * 60 * 1000);
    return () => clearInterval(t);
  }, [user?.id, isPublic]); // eslint-disable-line
  return null;
}

function PortalBanners() {
  const location = useLocation();
  if (isPublicRoute(location.pathname)) return null;
  return <><SupportModeBanner /><ViewOnlyBanner /></>;
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
      <SOSAlertPopup />
      <div className="flex-1 flex flex-col overflow-hidden">{children}</div>
    </div>
  );
}
