import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { HelmetProvider } from '@dr.pogodin/react-helmet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles/globals.css';
import './lib/i18n';
import { installSessionFetchInterceptor } from '@/lib/auth/session-fetch-interceptor';
import { initDiagnosticCapture } from '@/lib/diagnosticCapture';

// Install session expiry header interceptor before any fetch calls are made
installSessionFetchInterceptor();

// Start diagnostic event capture (safe, never blocks, never records sensitive data)
initDiagnosticCapture();

if (import.meta.env.MODE === 'development') {
  const meta = document.createElement('meta');
  meta.name = 'robots';
  meta.content = 'noindex, nofollow';
  document.head.appendChild(meta);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

const rootElement = document.getElementById('app');
if (!rootElement) throw new Error('Root element #app not found');

// Core providers — identical structure to entry-server.tsx so hydrateRoot
// sees the same tree the server rendered.
const tree = (
  <StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </HelmetProvider>
  </StrictMode>
);

// SSR markup is detected via a child element inside the root. hydrateRoot
// reattaches to the server-rendered tree; createRoot mounts fresh for dev/
// pre-SSR fallback.
if (rootElement.firstElementChild) {
  hydrateRoot(rootElement, tree);
} else {
  createRoot(rootElement).render(tree);
}

// ── Post-hydration client-only components ────────────────────────────────────
// These components must NOT be in the hydrateRoot tree because the server never
// renders them — doing so causes React #418 (hydration tree mismatch).
// Mount each in its own createRoot() after hydrateRoot() so React's reconciler
// never sees them during hydration.

// AppErrorBoundary — overlay root that catches global errors and shows the
// recovery screen. Mounted outside hydrateRoot so it never causes #418.
// It catches window.error and unhandledrejection globally; render errors inside
// the main root surface as unhandledrejection in production builds.
import('@/components/AppErrorBoundary').then(({ AppErrorBoundary }) => {
  const errorHost = document.createElement('div');
  errorHost.id = 'app-error-boundary-root';
  document.body.appendChild(errorHost);
  createRoot(errorHost).render(<AppErrorBoundary>{null}</AppErrorBoundary>);
});
import('@/components/CapacitorInit').then(({ default: CapacitorInit }) => {
  const host = document.createElement('div');
  host.id = 'capacitor-init-root';
  document.body.appendChild(host);
  createRoot(host).render(<CapacitorInit />);
});

import('@/components/ImpersonationBanner').then(({ default: ImpersonationBanner }) => {
  const host = document.createElement('div');
  host.id = 'impersonation-banner-root';
  document.body.appendChild(host);
  createRoot(host).render(<ImpersonationBanner />);
});

import('@/components/CookieBanner').then(({ default: CookieBanner }) => {
  const host = document.createElement('div');
  host.id = 'cookie-banner-root';
  document.body.appendChild(host);
  createRoot(host).render(<CookieBanner />);
}).catch(() => {
  // CookieBanner is optional — silently skip if it fails to load
});

// ── Toaster (Sonner) — mounted outside the SSR tree ──────────────────────────
// Sonner's <Toaster> appends a portal container to document.body via useEffect.
// When rendered inside the hydrateRoot tree, React's commitDeletionEffects can
// call removeChildFromContainer on that portal node before it is fully attached,
// throwing a non-recoverable NotFoundError (React 19 does not route this through
// onRecoverableError). Fix: mount Toaster in a completely separate createRoot
// that is never part of the SSR tree, so React's reconciler never tries to
// delete its portal container during hydration.
import('@/components/ui/sonner').then(({ Toaster }) => {
  const toastHost = document.createElement('div');
  toastHost.id = 'toast-root';
  document.body.appendChild(toastHost);
  createRoot(toastHost).render(<Toaster position="top-right" richColors />);
});

// ── Service Worker registration ───────────────────────────────────────────────
// Only register in production (not dev) to avoid stale-cache confusion during
// development. The SW caches only static shell assets — never API or user data.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        // Request an update immediately after registration so a new SW
        // is detected and activated without waiting for the next page load.
        registration.update().catch(() => {});
      })
      .catch((err) => {
        // Non-fatal — app works fine without SW
        console.warn('[SW] Registration failed:', err);
      });
  });
}
