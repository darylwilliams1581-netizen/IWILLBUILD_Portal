import { lazy, Suspense, useMemo, useEffect } from 'react';
import { Outlet, createBrowserRouter, type RouteObject, useLocation } from "react-router";
import { RouterProvider } from "react-router/dom";
import CookieBannerErrorBoundary from '@/components/CookieBannerErrorBoundary';
import RootLayout from './layouts/RootLayout';
import { routes } from './routes';
import ImpersonationBanner from '@/components/ImpersonationBanner';
import CapacitorInit from '@/components/CapacitorInit';
import AppErrorBoundary from '@/components/AppErrorBoundary';
import { recordRouteChange } from '@/lib/diagnosticCapture';

// ── Route change tracker ──────────────────────────────────────────────────────
function RouteChangeTracker() {
  const location = useLocation();
  useEffect(() => {
    recordRouteChange(location.pathname);
  }, [location.pathname]);
  return null;
}

const CookieBanner = lazy(() => import('@/components/CookieBanner').catch(error => {
  console.warn('Failed to load CookieBanner:', error);
  return {
    default: () => null
  };
}));

export default function App() {
  const router = useMemo(() => {
    const layoutElement = (
      <RouteChangeTracker />
    );
    void layoutElement; // suppress unused warning — RouteChangeTracker is used below

    const routeTree: RouteObject[] = [{
      element: (
        <>
          <RouteChangeTracker />
          <RootLayout>
            <Outlet />
          </RootLayout>
        </>
      ),
      children: routes
    }];
    return createBrowserRouter(routeTree);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppErrorBoundary>
      <CapacitorInit />
      <ImpersonationBanner />
      <RouterProvider router={router} />
      <CookieBannerErrorBoundary>
        <Suspense fallback={null}>
          <CookieBanner />
        </Suspense>
      </CookieBannerErrorBoundary>
    </AppErrorBoundary>
  );
}
