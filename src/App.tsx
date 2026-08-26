import { useMemo } from 'react';
import { Outlet, createBrowserRouter, type RouteObject } from "react-router";
import { RouterProvider } from "react-router/dom";
import RootLayout from './layouts/RootLayout';
import { routes } from './routes';
import AppErrorBoundary from '@/components/AppErrorBoundary';

// ── App ───────────────────────────────────────────────────────────────────────
// IMPORTANT: This component must render EXACTLY the same tree the server
// renders in entry-server.tsx — AppErrorBoundary > RouterProvider(RootLayout >
// Outlet). Any extra siblings (CapacitorInit, ImpersonationBanner, CookieBanner,
// RouteChangeTracker) cause React #418 (hydration tree mismatch) because the
// server never renders them. Those components are either:
//   - Mounted in separate createRoot() calls in main.tsx after hydrateRoot()
//   - Placed inside RootLayout (which exists on both server and client)
export default function App() {
  const router = useMemo(() => {
    const routeTree: RouteObject[] = [{
      element: (
        <RootLayout>
          <Outlet />
        </RootLayout>
      ),
      children: routes
    }];
    return createBrowserRouter(routeTree);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppErrorBoundary>
      <RouterProvider router={router} />
    </AppErrorBoundary>
  );
}
