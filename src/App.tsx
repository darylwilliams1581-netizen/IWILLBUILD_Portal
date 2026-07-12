import { lazy, Suspense, useMemo } from 'react'; // v16 2026-07-13n — removed StaleModuleReloadBoundary from route tree (hydration parity)
import {
  Outlet,
  RouterProvider,
  createBrowserRouter,
  type RouteObject,
} from 'react-router-dom';

import PortalErrorBoundary from '@/components/PortalErrorBoundary';
import CookieBannerErrorBoundary from '@/components/CookieBannerErrorBoundary';
import RootLayout from './layouts/RootLayout';
import Spinner from './components/Spinner';
import { routes } from './routes';
import ImpersonationBanner from '@/components/ImpersonationBanner';

const CookieBanner = lazy(() =>
  import('@/components/CookieBanner').catch((error) => {
    console.warn('Failed to load CookieBanner:', error);
    return { default: () => null };
  })
);

const SpinnerFallback = () => (
  <div className="flex justify-center py-8 h-screen items-center">
    <Spinner />
  </div>
);

export default function App() {
  const router = useMemo(() => {
    // Layout element — must match the structure in entry-server.tsx exactly so
    // hydrateRoot sees the same component tree the server rendered.
    // Dev-only boundaries (AiroErrorBoundary, SosInterceptBoundary) are added
    // by DevBoundaryShell in main.tsx AFTER hydration to avoid React #418.
    const layoutElement = (
      <Suspense fallback={<SpinnerFallback />}>
        <RootLayout>
          <Outlet />
        </RootLayout>
      </Suspense>
    );

    // Production uses PortalErrorBoundary; dev uses AiroErrorBoundary which is
    // mounted by DevBoundaryShell in main.tsx (post-hydration). In prod there is
    // no SSR/client mismatch because PortalErrorBoundary is not in the server
    // tree either — it wraps the already-hydrated subtree.
    const outerElement =
      import.meta.env.MODE === 'development'
        ? layoutElement
        : <PortalErrorBoundary>{layoutElement}</PortalErrorBoundary>;

    const routeTree: RouteObject[] = [
      {
        element: outerElement,
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
