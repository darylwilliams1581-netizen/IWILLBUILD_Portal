// v18 2026-07-13 — removed Suspense from route tree wrapper (SSR mismatch fix)
import { lazy, Suspense, useMemo } from 'react';
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
