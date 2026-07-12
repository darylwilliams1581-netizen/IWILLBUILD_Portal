import { lazy, Suspense, useMemo } from 'react'; // v11 cache-bust 2026-07-13e
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
import RootLayout from './layouts/RootLayout3';
import Spinner from './components/Spinner';
import { routes } from './routes';
// DazzaWidget removed — Dazza AI is accessible via the sidebar nav link
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
  // Build the router inside the component so React Fast Refresh re-creates it
  // with the current RootLayout3 reference on every HMR cycle, preventing the
  // frozen RootLayout.tsx?t=1783772358219 snapshot from being called.
  const router = useMemo(() => {
    const rootElement = (
      <Suspense fallback={<SpinnerFallback />}>
        <RootLayout>
          <Outlet />
        </RootLayout>
      </Suspense>
    );

    const routeTree: RouteObject[] = [
      {
        element:
          import.meta.env.MODE === 'development' ? (
            <StaleModuleReloadBoundary>
              <AiroErrorBoundary captureGlobalErrors={false}>{rootElement}</AiroErrorBoundary>
            </StaleModuleReloadBoundary>
          ) : (
            <StaleModuleReloadBoundary>
              <PortalErrorBoundary>{rootElement}</PortalErrorBoundary>
            </StaleModuleReloadBoundary>
          ),
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
