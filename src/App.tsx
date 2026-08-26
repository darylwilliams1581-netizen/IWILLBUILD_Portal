import { useMemo } from 'react';
import { Outlet, createBrowserRouter, type RouteObject } from "react-router";
import { RouterProvider } from "react-router/dom";
import RootLayout from './layouts/RootLayout';
import { routes } from './routes';

// ── App ───────────────────────────────────────────────────────────────────────
// IMPORTANT: This component must render EXACTLY the same tree the server
// renders in entry-server.tsx — RouterProvider(RootLayout > Outlet).
// AppErrorBoundary is intentionally NOT here — it lives in main.tsx wrapping
// the entire providers tree so it never appears inside the hydration boundary.
// Any extra wrappers here cause React #418 (hydration tree mismatch) because
// the server (entry-server.tsx) uses StaticRouterProvider with no extra wrapper.
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

  return <RouterProvider router={router} />;
}
