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
import CapacitorInit from '@/components/CapacitorInit';

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
const STALE_TS = ['1784519099416', '1784518714435', '1784516505220', '1784585282530', '1784589710474', '1784590013856', '1784800000000'];
function isStaleRemoveChildError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // NotFoundError is exclusively caused by the stale shim — always treat as stale.
  if (err.name === 'NotFoundError') return true;
  const text = (err.message ?? '') + (err.stack ?? '');
  if (STALE_TS.some((ts) => text.includes(ts))) return true;
  if (text.includes('patchedRemoveChild')) return true;
  return false;
}

const RELOAD_KEY = 'app_stale_reload_ts';
const RELOAD_COUNT_KEY = 'app_stale_reload_count';
class StaleShimBoundary extends Component<{ children: ReactNode }, { caught: boolean }> {
  state = { caught: false };
  static getDerivedStateFromError(err: unknown) {
    try {
      if (err instanceof Error && err.name === 'NotFoundError') return { caught: true };
      return { caught: isStaleRemoveChildError(err) };
    } catch {
      return { caught: false };
    }
  }
  componentDidCatch(err: unknown) {
    const isStale = isStaleRemoveChildError(err);
    if (!isStale) return;
    try {
      const last = parseInt(sessionStorage.getItem(RELOAD_KEY) ?? '0', 10);
      const count = parseInt(sessionStorage.getItem(RELOAD_COUNT_KEY) ?? '0', 10);
      const elapsed = Date.now() - last;
      // Allow reload if: first time, or >2s since last reload and under 5 attempts
      if (last === 0 || (elapsed > 2000 && count < 5)) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        sessionStorage.setItem(RELOAD_COUNT_KEY, String(count + 1));
        // Hard reload (bypass cache) on 2nd+ attempt to evict the stale shim module
        if (count >= 1) {
          window.location.href = window.location.href.split('?')[0] + '?_bust=' + Date.now();
        } else {
          window.location.reload();
        }
      }
    } catch { /* ignore */ }
  }
  render() {
    if (this.state.caught) return <div style={{ display: 'none' }} />;
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
      <StaleShimBoundary>
        <RootLayout>
          <Outlet />
        </RootLayout>
      </StaleShimBoundary>
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
      <CapacitorInit />
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
