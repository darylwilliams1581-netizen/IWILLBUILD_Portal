// cache-bust 2026-07-13m — SosInterceptBoundary wraps AiroErrorBoundary to catch SOS before it
// sos-shim MUST be the first import — sets globalThis.SOSAlertPopup before
// the frozen Vite HMR snapshot of RootLayout.tsx (t=1783772358219) executes.
import './sos-shim';
import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { HelmetProvider } from '@dr.pogodin/react-helmet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AiroErrorBoundary from '../dev-tools/src/AiroErrorBoundary';
import App from './App';
import './styles/globals.css';
import './lib/i18n';
import { installSessionFetchInterceptor } from '@/lib/auth/session-fetch-interceptor';

// Install session expiry header interceptor before any fetch calls are made
installSessionFetchInterceptor();

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

// ── SosInterceptBoundary ──────────────────────────────────────────────────────
// Sits INSIDE AiroErrorBoundary (closer to the throw site) so it catches the
// SOSAlertPopup ReferenceError from the frozen RootLayout snapshot before
// AiroErrorBoundary swallows it. On SOS error: reload once via the index.html
// guard. On any other error: re-throw so AiroErrorBoundary handles it.
const LS_KEY = 'sos_intercept_reload_ts';
const WINDOW_MS = 20_000;

function sosRecentReload(): boolean {
  try {
    const ts = parseInt(localStorage.getItem(LS_KEY) ?? '0', 10);
    return ts > 0 && Date.now() - ts < WINDOW_MS;
  } catch { return false; }
}

function isSosError(e: unknown): boolean {
  return e instanceof Error &&
    e.message.includes('SOSAlertPopup');
}

interface BoundaryState { caught: boolean; }
class SosInterceptBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { caught: false };
  private _other: Error | null = null;

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { caught: true };
  }

  componentDidCatch(error: Error) {
    if (isSosError(error)) {
      // Trigger reload via the index.html centralised guard
      if (typeof (window as any).__sosBoundaryTrigger === 'function') {
        (window as any).__sosBoundaryTrigger();
      } else if (!sosRecentReload()) {
        try { localStorage.setItem(LS_KEY, String(Date.now())); } catch (_) {}
        window.location.reload();
      }
    } else {
      this._other = error;
    }
  }

  render() {
    if (this._other) {
      const err = this._other;
      this._other = null;
      throw err;
    }
    if (this.state.caught) return null; // waiting for reload
    return this.props.children;
  }
}

const rootElement = document.getElementById('app');
if (!rootElement) throw new Error('Root element not found');

const providers = (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </HelmetProvider>
);

const tree = (
  <StrictMode>
    {import.meta.env.MODE === 'development' ? (
      <AiroErrorBoundary>
        <SosInterceptBoundary>
          {providers}
        </SosInterceptBoundary>
      </AiroErrorBoundary>
    ) : (
      providers
    )}
  </StrictMode>
);

// SSR markup is detected via a child element inside the #app root. hydrateRoot
// reattaches to the server-rendered tree; createRoot mounts fresh for dev/
// pre-SSR fallback.
if (rootElement.firstElementChild) {
  hydrateRoot(rootElement, tree);
} else {
  createRoot(rootElement).render(tree);
}

// ── Service Worker registration ───────────────────────────────────────────────
// Only register in production (not dev) to avoid stale-cache confusion during
// development. The SW caches only static shell assets — never API or user data.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        // Non-fatal — app works fine without SW
        console.warn('[SW] Registration failed:', err);
      });
  });
}
