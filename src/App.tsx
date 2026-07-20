// v19 2026-07-20 — StaleShimBoundary above RouterProvider to catch removeChild NotFoundError
import { Component, type ReactNode, lazy, Suspense, useMemo, useEffect } from 'react';
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

// ── StaleShimBoundary ─────────────────────────────────────────────────────────
// The stale sos-shim snapshot (t=1784519099416) throws NotFoundError from its
// patchedRemoveChild. React Router's RenderErrorBoundary catches it before
// SosInnerBoundary (which is inside RootLayout, lower in the tree). This
// boundary sits ABOVE RouterProvider so it intercepts first, suppresses the
// error, and triggers a reload to evict the stale module.
const STALE_TS = ['1784519099416', '1784518714435', '1784516505220'];
function isStaleRemoveChildError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const text = (err.message ?? '') + (err.stack ?? '');
  if (err.name === 'NotFoundError' && text.includes('removeChild')) return true;
  if (STALE_TS.some((ts) => text.includes(ts))) return true;
  return false;
}

const RELOAD_KEY = 'app_stale_reload_ts';
class StaleShimBoundary extends Component<{ children: ReactNode }, { caught: boolean }> {
  state = { caught: false };
  static getDerivedStateFromError(err: unknown) {
    return { caught: isStaleRemoveChildError(err) };
  }
  componentDidCatch(err: unknown) {
    if (!isStaleRemoveChildError(err)) throw err;
    try {
      const last = parseInt(sessionStorage.getItem(RELOAD_KEY) ?? '0', 10);
      if (Date.now() - last > 8000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
      }
    } catch { /* ignore */ }
  }
  render() {
    if (this.state.caught) return null;
    return this.props.children;
  }
}

export default function App() {
  // Suppress stale-cache leaflet errors globally.
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
      <StaleShimBoundary>
        <RouterProvider router={router} />
      </StaleShimBoundary>
      <CookieBannerErrorBoundary>
        <Suspense fallback={null}>
          <CookieBanner />
        </Suspense>
      </CookieBannerErrorBoundary>
    </>
  );
}
