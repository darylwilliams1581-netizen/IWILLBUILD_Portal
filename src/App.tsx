import { lazy, Suspense, useMemo } from 'react'; // v15 2026-07-13i — StaleModuleReloadBoundary innermost; bust frozen App snapshot
import {
  Outlet,
  RouterProvider,
  createBrowserRouter,
  type RouteObject,
} from 'react-router-dom';

import AiroErrorBoundary from '../dev-tools/src/AiroErrorBoundary';
import PortalErrorBoundary from '@/components/PortalErrorBoundary';
import CookieBannerErrorBoundary from '@/components/CookieBannerErrorBoundary';
import StaleModuleReloadBoundary from '@/components/StaleModuleReloadBoundary';
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
    // StaleModuleReloadBoundary wraps RootLayout directly and sits INSIDE
    // AiroErrorBoundary. React finds the nearest ancestor boundary walking up
    // from the throw site (RootLayout line 122). The walk order is:
    //   RootLayout → StaleModuleReloadBoundary ← caught here first
    // AiroErrorBoundary is further up and never sees the SOSAlertPopup error.
    const layoutElement = (
      <Suspense fallback={<SpinnerFallback />}>
        <StaleModuleReloadBoundary>
          <RootLayout>
            <Outlet />
          </RootLayout>
        </StaleModuleReloadBoundary>
      </Suspense>
    );

    const outerElement =
      import.meta.env.MODE === 'development' ? (
        <AiroErrorBoundary captureGlobalErrors={false}>{layoutElement}</AiroErrorBoundary>
      ) : (
        <PortalErrorBoundary>{layoutElement}</PortalErrorBoundary>
      );

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
