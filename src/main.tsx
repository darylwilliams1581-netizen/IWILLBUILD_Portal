// cache-bust 2026-07-13n — hydration-safe: dev error boundaries mount after hydrateRoot
// sos-shim MUST be the first import — sets globalThis.SOSAlertPopup before
// the frozen Vite HMR snapshot of RootLayout.tsx (t=1783772358219) executes.
import './sos-shim';
import { Component, StrictMode, useEffect, useState, type ReactNode } from 'react';
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
// Catches the SOSAlertPopup ReferenceError from the frozen RootLayout snapshot.
// On SOS error: reload once via the index.html guard.
// On any other error: re-throw so AiroErrorBoundary handles it.
const LS_KEY = 'sos_intercept_reload_ts';
const WINDOW_MS = 20_000;

function sosRecentReload(): boolean {
  try {
    const ts = parseInt(localStorage.getItem(LS_KEY) ?? '0', 10);
    return ts > 0 && Date.now() - ts < WINDOW_MS;
  } catch { return false; }
}

function isSosError(e: unknown): boolean {
  return e instanceof Error && e.message.includes('SOSAlertPopup');
}

interface BoundaryState { caught: boolean; }
class SosInterceptBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { caught: false };
  private _other: Error | null = null;

  static getDerivedStateFromError(_error: Error): BoundaryState {
    return { caught: true };
  }

  componentDidCatch(error: Error) {
    if (isSosError(error)) {
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
    if (this.state.caught) return null;
    return this.props.children;
  }
}

// ── DevBoundaryShell ──────────────────────────────────────────────────────────
// Dev-only error boundaries must NOT be part of the server-rendered tree or the
// initial hydrateRoot call — they don't exist in entry-server.tsx so including
// them in the hydration tree causes React #418 (tree mismatch).
//
// Solution: use a module-level flag (not component state) so HMR hot-reloads
// don't carry over a stale `mounted=true` into the next hydration attempt.
// The flag starts false, is set to true after the first effect, and stays true
// for the lifetime of the page (no reset on HMR).
let _devShellHydrated = false;

function DevBoundaryShell({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(_devShellHydrated);
  useEffect(() => {
    if (!_devShellHydrated) {
      _devShellHydrated = true;
      setHydrated(true);
    }
  }, []);

  if (!hydrated) {
    // During hydration: transparent pass-through — tree matches entry-server.tsx.
    return <>{children}</>;
  }

  // After hydration: wrap with dev error boundaries.
  return (
    <AiroErrorBoundary>
      <SosInterceptBoundary>
        {children}
      </SosInterceptBoundary>
    </AiroErrorBoundary>
  );
}

const rootElement = document.getElementById('app');
if (!rootElement) throw new Error('Root element not found');

// Core providers — identical structure to entry-server.tsx so hydrateRoot
// sees the same tree the server rendered. Dev boundaries are added by
// DevBoundaryShell after the first effect (post-hydration).
const providers = (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </HelmetProvider>
);

const tree = (
  <StrictMode>
    {import.meta.env.MODE === 'development'
      ? <DevBoundaryShell>{providers}</DevBoundaryShell>
      : providers
    }
  </StrictMode>
);

// SSR markup is detected via a child element inside the #app root. hydrateRoot
// reattaches to the server-rendered tree; createRoot mounts fresh for dev/
// pre-SSR fallback.
if (rootElement.firstElementChild) {
  hydrateRoot(rootElement, tree, {
    // Browser extensions (Grammarly, LastPass, etc.) inject style attributes onto
    // DOM nodes before React hydrates, causing spurious hydration mismatches.
    // These are recoverable — React re-renders on the client and the UI is correct.
    // Suppress them here so they don't surface as errors in the dev error boundary.
    onRecoverableError(error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('Hydration') || msg.includes('hydration') || msg.includes('hydrat')) return;
      console.error('[hydrateRoot] Recoverable error:', error);
    },
  });
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
