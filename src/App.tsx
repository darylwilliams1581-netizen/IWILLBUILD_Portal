import { lazy, Suspense, useMemo } from 'react'; // v14 2026-07-13h — force-recompile to evict frozen RootLayout import
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
    // StaleModuleReloadBoundary MUST be the outermost boundary — wrapping
    // everything including AiroErrorBoundary — so it intercepts the
    // SOSAlertPopup ReferenceError before AiroErrorBoundary can swallow it
    // and prevent the reload.
    // StaleModuleReloadBoundary wraps RootLayout directly — INSIDE
    // AiroErrorBoundary — so it intercepts the SOSAlertPopup ReferenceError
    // before AiroErrorBoundary can report it to the platform.
    const innerElement = (
      <StaleModuleReloadBoundary>
        <Suspense fallback={<SpinnerFallback />}>
          <RootLayout>
            <Outlet />
          </RootLayout>
        </Suspense>
      </StaleModuleReloadBoundary>
    );

    const routeTree: RouteObject[] = [
      {
        element: (
          import.meta.env.MODE === 'development' ? (
            <AiroErrorBoundary captureGlobalErrors={false}>{innerElement}</AiroErrorBoundary>
          ) : (
            <PortalErrorBoundary>{innerElement}</PortalErrorBoundary>
          )
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
