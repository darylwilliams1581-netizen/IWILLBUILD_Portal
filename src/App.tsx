// v18 2026-07-13 — removed Suspense from route tree wrapper (SSR mismatch fix)
import { lazy, Suspense, useMemo, useEffect } from 'react';
import {
  Outlet,
  RouterProvider,
  createBrowserRouter,
  type RouteObject,
} from 'react-router-dom';

import CookieBannerErrorBoundary from '@/components/CookieBannerErrorBoundary';
import RootLayout from './layouts/RootLayout';
import { routes } from './routes';
import ImpersonationBanner from '@/components/ImpersonationBanner';

const CookieBanner = lazy(() =>
  import('@/components/CookieBanner').catch((error) => {
    console.warn('Failed to load CookieBanner:', error);
    return { default: () => null };
  })
);

export default function App() {
  // Suppress stale-cache leaflet errors globally. The browser has an old
  // pre-bundled leaflet.js on disk (v=05d76b4a) that was cached before Leaflet
  // was removed. The server stub intercepts new requests but cannot evict a
  // file the browser serves directly from disk. This handler prevents the
  // stale chunk's runtime errors from reaching React's error boundary.
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      const src = e.filename ?? '';
      const msg = e.message ?? '';
      if (src.includes('leaflet') || msg.includes('_leaflet') || msg.includes('leaflet')) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const onUnhandled = (e: PromiseRejectionEvent) => {
      const msg = String(e.reason ?? '');
      if (msg.includes('leaflet') || msg.includes('_leaflet')) e.preventDefault();
    };
    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => {
      window.removeEventListener('error', onError, true);
      window.removeEventListener('unhandledrejection', onUnhandled);
    };
  }, []);
  const router = useMemo(() => {
    // This layout element MUST exactly mirror the route tree in entry-server.tsx.
    // No Suspense wrapper here — renderToString resolves it synchronously and
    // serialises the inner div, but the client sees the Suspense boundary itself,
    // causing React hydration mismatch #418. Lazy page components carry their
    // own Suspense boundaries inside routes.tsx.
    const layoutElement = (
      <RootLayout>
        <Outlet />
      </RootLayout>
    );

    const routeTree: RouteObject[] = [
      {
        element: layoutElement,
        children: routes,
      },
    ];

    return createBrowserRouter(routeTree);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <ImpersonationBanner />
      <RouterProvider router={router} />
      <CookieBannerErrorBoundary>
        <Suspense fallback={null}>
          <CookieBanner />
        </Suspense>
      </CookieBannerErrorBoundary>
    </>
  );
}
