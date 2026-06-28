import { Helmet } from '@dr.pogodin/react-helmet';
import { type ReactElement, useEffect, useRef } from 'react';
import { ScrollRestoration, useLocation } from 'react-router-dom';
import { useSession } from '@/lib/auth/auth-client';
import SupportModeBanner from '@/components/SupportModeBanner';
import ViewOnlyBanner from '@/components/ViewOnlyBanner';

/**
 * Root layout for IWILLBUILD Portal — fullscreen dashboard app.
 * No shared header/footer; each page manages its own layout.
 */
interface RootLayoutProps {
  children: ReactElement;
}

/** Sends a lightweight ping to update last_active_at. Fires on mount and every 2 minutes. */
function ActivePing() {
  const { user } = useSession();
  const location = useLocation();
  const lastPingRef = useRef<number>(0);

  const ping = () => {
    if (!user) return;
    const now = Date.now();
    // Throttle: don't ping more than once per 60 seconds
    if (now - lastPingRef.current < 60_000) return;
    lastPingRef.current = now;
    void fetch('/api/active-ping', { method: 'POST', credentials: 'include' }).catch(() => {});
  };

  // Ping on route change
  useEffect(() => {
    ping();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, user?.id]);

  // Ping every 2 minutes
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(ping, 2 * 60 * 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return null;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Helmet>
        <title>IWILLBUILD Portal</title>
        <meta name="description" content="Internal operations portal for IWILLBUILD — manage jobs, crews, fleet, and more." />
      </Helmet>
      <SupportModeBanner />
      <ViewOnlyBanner />
      <ScrollRestoration />
      <ActivePing />
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
