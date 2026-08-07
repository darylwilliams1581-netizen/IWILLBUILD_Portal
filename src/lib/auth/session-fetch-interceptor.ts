/**
 * Session Fetch Interceptor
 *
 * Patches the global `fetch` once to:
 *   1. Attach `x-iwb-session-expires` header to every same-origin /api/* request
 *      so the server can enforce the 14h / 06:00 cutoff independently.
 *   2. Dispatch `iwb:session:401` when any /api/* response returns 401 with
 *      code "SESSION_EXPIRED" — triggers the client-side expiry flow.
 *
 * Call `installSessionFetchInterceptor()` once at app boot (main.tsx or
 * App.tsx). Idempotent — safe to call multiple times.
 */

import { readSessionExpiry } from '@/lib/auth/session-timeout';
import { SESSION_401_EVENT } from '@/lib/auth/useSessionTimeout';

const INTERCEPTOR_INSTALLED_KEY = '__iwb_fetch_interceptor__';
const SESSION_EXPIRY_HEADER = 'x-iwb-session-expires';

export function installSessionFetchInterceptor(): void {
  if (typeof window === 'undefined') return;
  // Idempotent guard
  if ((window as unknown as Record<string, unknown>)[INTERCEPTOR_INSTALLED_KEY]) return;
  (window as unknown as Record<string, unknown>)[INTERCEPTOR_INSTALLED_KEY] = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    // Determine if this is a same-origin /api/* call
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;

    const isApiCall =
      url.startsWith('/api/') ||
      (url.startsWith(window.location.origin) && url.includes('/api/'));

    if (isApiCall) {
      // Only attach expiry header if the stored value is still in the future.
      // If it's already expired, omit the header entirely so the server falls
      // back to the BetterAuth cookie — avoids false 401s when the custom
      // cutoff has passed but the underlying cookie is still valid.
      const expiresAt = readSessionExpiry();
      if (expiresAt !== null && expiresAt > Date.now()) {
        const headers = new Headers((init?.headers as HeadersInit | undefined) ?? {});
        headers.set(SESSION_EXPIRY_HEADER, String(expiresAt));
        init = { ...init, headers };
      }
    }

    const response = await originalFetch(input, init);

    // Detect server-side session expiry
    if (isApiCall && response.status === 401) {
      // Clone to read body without consuming the original
      try {
        const clone = response.clone();
        const body = await clone.json().catch(() => null) as Record<string, unknown> | null;
        if (body?.code === 'SESSION_EXPIRED') {
          window.dispatchEvent(new CustomEvent(SESSION_401_EVENT));
        }
      } catch {
        // best-effort — don't block the response
      }
    }

    return response;
  };
}
