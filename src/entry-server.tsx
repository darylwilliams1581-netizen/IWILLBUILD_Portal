import { StrictMode } from 'react'; // v24 2026-07-13 — removed Suspense from route tree (SSR mismatch)
import { renderToString } from 'react-dom/server';
import { HelmetProvider } from '@dr.pogodin/react-helmet';
import type { HelmetServerState } from '@dr.pogodin/react-helmet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Outlet, StaticRouterProvider, createStaticHandler, createStaticRouter, type RouteObject } from "react-router";
import RootLayout from './layouts/RootLayout';
import { routes } from './routes';export interface RenderResult {
  html: string;
  head: string;
  status: number;
  redirect?: string;
}

// Mirrors the layout wrapping in App.tsx exactly — no Suspense wrapper here.
// renderToString resolves Suspense synchronously and serialises the inner div,
// but the client sees the Suspense boundary itself, causing a tree mismatch.
// Lazy page components carry their own Suspense boundaries inside routes.tsx.
//
// RouteChangeTracker is placed inside RootLayout (via a useEffect in RootLayout)
// so it never appears as a sibling element here and cannot cause a tree mismatch.
const routeTree: RouteObject[] = [{
  element: <RootLayout>
        <Outlet />
      </RootLayout>,
  children: routes
}];
const handler = createStaticHandler(routeTree);
export async function render(url: string): Promise<RenderResult> {
  // createStaticHandler works off a WHATWG Request. We only need the pathname +
  // search; scheme/host don't affect routing. Using a stable sentinel host
  // avoids env-dependent URL parsing.
  const context = await handler.query(new Request(`http://ssr${url}`));

  // A loader/action that throws a Response (or calls redirect()) surfaces here
  // as a Response instead of a StaticHandlerContext. Forward the redirect.
  if (context instanceof Response) {
    return {
      html: '',
      head: '',
      status: context.status,
      redirect: context.headers.get('Location') ?? undefined
    };
  }
  const router = createStaticRouter(routeTree, context);
  const helmetContext: {
    helmet?: HelmetServerState;
  } = {};
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 10,
        retry: 1,
        refetchOnWindowFocus: false
      },
      mutations: {
        retry: 0
      }
    }
  });
  const html = renderToString(<StrictMode>
      <HelmetProvider context={helmetContext}>
        <QueryClientProvider client={queryClient}>
          <StaticRouterProvider router={router} context={context} />
        </QueryClientProvider>
      </HelmetProvider>
    </StrictMode>);
  const h = helmetContext.helmet;
  const head = h ? [h.title?.toString() ?? '', h.meta?.toString() ?? '', h.link?.toString() ?? '', h.script?.toString() ?? ''].filter(Boolean).join('\n') : '';
  return {
    html,
    head,
    status: context.statusCode ?? 200
  };
}
