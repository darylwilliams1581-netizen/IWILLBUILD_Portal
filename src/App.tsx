import { lazy, Suspense, useMemo } from 'react'; // v13 2026-07-13g — stale-boundary innermost
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
    // StaleModuleReloadBoundary MUST be the innermost boundary — wrapping
    // RootLayout directly — so it catches the SOSAlertPopup ReferenceError
    // thrown by the frozen Vite HMR snapshot (t=1783772358219) before
    // AiroErrorBoundary or PortalErrorBoundary can intercept it.
    const innerElement = (
      <Suspense fallback={<SpinnerFallback />}>
        <RootLayout>
          <Outlet />
        </RootLayout>
      </Suspense>
    );

    // StaleModuleReloadBoundary must be OUTSIDE AiroErrorBoundary/PortalErrorBoundary
    // so it intercepts the SOSAlertPopup ReferenceError before those boundaries swallow it.
    const routeTree: RouteObject[] = [
      {
        element: (
          <StaleModuleReloadBoundary>
            {import.meta.env.MODE === 'development' ? (
              <AiroErrorBoundary captureGlobalErrors={false}>{innerElement}</AiroErrorBoundary>
            ) : (
              <PortalErrorBoundary>{innerElement}</PortalErrorBoundary>
            )}
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
