/**
 * api-client.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central API client. All fetch calls through apiFetch() are automatically
 * recorded in the diagnostic buffer (method, sanitised path, status, duration).
 *
 * NEVER records request/response bodies, auth headers, or sensitive params.
 */

import { recordApiRequest } from './diagnosticCapture.js';

const API_BASE = '/api';

// ── Instrumented fetch wrapper ────────────────────────────────────────────────

/**
 * apiFetch — drop-in replacement for fetch() for internal API calls.
 * Records method / sanitised pathname / status / duration in the diagnostic
 * buffer. Does NOT record headers, bodies, or query parameters.
 */
export async function apiFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const start = performance.now();
  let pathname = '/unknown';
  let method = (init?.method ?? 'GET').toUpperCase();

  try {
    if (typeof input === 'string') {
      pathname = input.startsWith('http') ? new URL(input).pathname : input.split('?')[0];
    } else if (input instanceof URL) {
      pathname = input.pathname;
    } else if (input instanceof Request) {
      pathname = new URL(input.url).pathname;
      method = input.method.toUpperCase();
    }
  } catch { /* ignore */ }

  let status = 0;
  try {
    const res = await fetch(input, init);
    status = res.status;
    return res;
  } catch (err) {
    status = 0;
    throw err;
  } finally {
    try {
      const duration = performance.now() - start;
      recordApiRequest(method, pathname, status, duration);
    } catch { /* never crash */ }
  }
}

// ── Legacy helpers ────────────────────────────────────────────────────────────

export async function checkHealth() {
  const response = await apiFetch(`${API_BASE}/health`);
  if (!response.ok) {
    throw new Error('Health check failed');
  }
  return response.json();
}
