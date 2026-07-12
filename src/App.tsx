import { lazy, Suspense } from 'react'; // v9 cache-bust 2026-07-13a
import {
  Outlet,
  RouterProvider,
  createBrowserRouter,
  type RouteObject,
} from 'react-router-dom';

import AiroErrorBoundary from '../dev-tools/src/AiroErrorBoundary';
import PortalErrorBoundary from '@/components/PortalErrorBoundary';
import CookieBannerErrorBoundary from '@/components/CookieBannerErrorBoundary';
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

const rootElement = (
  <Suspense fallback={<SpinnerFallback />}>
    <RootLayout>
      <Outlet />
    </RootLayout>
    
  </Suspense>
);

// Wrap the agent-editable flat `routes` array in a layout route so ScrollRestoration
// + shared chrome live once above every page. Keeping the wrap here (instead of
// in routes.tsx) preserves the agent's simple flat-route contract. The dev
// boundary must live inside the route element so React Router doesn't replace it
// with its default route error UI before our boundary can catch render errors.
//
// `captureGlobalErrors={false}`: the ROOT boundary in main.tsx owns the global
// window.onerror/unhandledrejection handlers. This inner boundary only catches
// route render errors via componentDidCatch — installing window handlers here
// too would double-forward async errors and stack a second overlay.
//
// In production we use PortalErrorBoundary (class-based) which shows a friendly
// "Something went wrong — Refresh / Go to Login" screen instead of a blank crash.
const routeTree: RouteObject[] = [
  {
    element:
      import.meta.env.MODE === 'development' ? (
        <AiroErrorBoundary captureGlobalErrors={false}>{rootElement}</AiroErrorBoundary>
      ) : (
        <PortalErrorBoundary>{rootElement}</PortalErrorBoundary>
      ),
    children: routes,
  },
];

const router = createBrowserRouter(routeTree);

export default function App() {
  return (
    <>
      <ImpersonationBanner />
      <RouterProvider router={router} />
      {/*
        CookieBanner reads document.cookie and subscribes to browser events.
        App.tsx is client-only (entry-server.tsx renders the route tree
        directly without importing App), so no SSR gate is needed here.
      */}
      <CookieBannerErrorBoundary>
        <Suspense fallback={null}>
          <CookieBanner />
        </Suspense>
      </CookieBannerErrorBoundary>
    </>
  );
}
