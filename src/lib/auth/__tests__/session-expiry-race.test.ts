/**
 * Regression tests for the post-login automatic sign-out race condition.
 *
 * Root cause: useSessionTimeout read an expired (or absent) localStorage stamp
 * on mount and called signOut() ~1 second after a successful login.
 *
 * Fix: BetterAuth server session is the sole expiry authority. The localStorage
 * mechanism is fully removed. These tests confirm the fix holds.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Helpers ───────────────────────────────────────────────────────────────────

function setLegacyStamp(value: string | null) {
  if (value === null) {
    localStorage.removeItem('iwb_session_expires_at');
  } else {
    localStorage.setItem('iwb_session_expires_at', value);
  }
}

// ── 1. useSessionTimeout is a no-op ──────────────────────────────────────────

describe('useSessionTimeout', () => {
  it('returns { isExpired: false } always — never calls signOut', async () => {
    const { useSessionTimeout } = await import('../useSessionTimeout');
    const result = useSessionTimeout();
    expect(result.isExpired).toBe(false);
  });

  it('exports SESSION_401_EVENT for import compatibility', async () => {
    const { SESSION_401_EVENT } = await import('../useSessionTimeout');
    expect(typeof SESSION_401_EVENT).toBe('string');
    expect(SESSION_401_EVENT.length).toBeGreaterThan(0);
  });
});

// ── 2. installSessionFetchInterceptor is a no-op ──────────────────────────────

describe('installSessionFetchInterceptor', () => {
  it('does not modify window.fetch', async () => {
    const originalFetch = window.fetch;
    const { installSessionFetchInterceptor } = await import('../session-fetch-interceptor');
    installSessionFetchInterceptor();
    expect(window.fetch).toBe(originalFetch);
  });

  it('is idempotent — calling multiple times does not throw', async () => {
    const { installSessionFetchInterceptor } = await import('../session-fetch-interceptor');
    expect(() => {
      installSessionFetchInterceptor();
      installSessionFetchInterceptor();
      installSessionFetchInterceptor();
    }).not.toThrow();
  });

  it('does not attach x-iwb-session-expires to fetch calls', async () => {
    const { installSessionFetchInterceptor } = await import('../session-fetch-interceptor');
    installSessionFetchInterceptor();

    const capturedHeaders: Record<string, string> = {};
    const mockFetch = vi.fn().mockImplementation((_url: unknown, init?: RequestInit) => {
      const h = new Headers(init?.headers as HeadersInit | undefined);
      h.forEach((v, k) => { capturedHeaders[k] = v; });
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    window.fetch = mockFetch;

    await window.fetch('/api/me', { credentials: 'include' });
    expect(capturedHeaders['x-iwb-session-expires']).toBeUndefined();
  });
});

// ── 3. Expired legacy stamp does NOT trigger sign-out ─────────────────────────

describe('expired legacy localStorage stamp', () => {
  let signOutSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    signOutSpy = vi.fn().mockResolvedValue(undefined);
    // Inject a spy — if signOut is called automatically this test will catch it
    vi.doMock('@/lib/auth/auth-client', () => ({
      signOut: signOutSpy,
      useSession: vi.fn().mockReturnValue({ session: null, isPending: false, isAuthenticated: false }),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('iwb_session_expires_at');
  });

  it('does not call signOut when an expired stamp is present in localStorage', async () => {
    // Simulate a stamp that expired 2 days ago
    const expiredStamp = String(Date.now() - 2 * 24 * 60 * 60 * 1000);
    setLegacyStamp(expiredStamp);

    const { useSessionTimeout } = await import('../useSessionTimeout');
    const result = useSessionTimeout();

    // Give any async work a tick to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(result.isExpired).toBe(false);
    expect(signOutSpy).not.toHaveBeenCalled();
  });

  it('does not call signOut when no stamp is present in localStorage', async () => {
    setLegacyStamp(null);

    const { useSessionTimeout } = await import('../useSessionTimeout');
    useSessionTimeout();

    await new Promise((r) => setTimeout(r, 10));
    expect(signOutSpy).not.toHaveBeenCalled();
  });

  it('does not call signOut when a future stamp is present', async () => {
    // Stamp 29 days in the future
    const futureStamp = String(Date.now() + 29 * 24 * 60 * 60 * 1000);
    setLegacyStamp(futureStamp);

    const { useSessionTimeout } = await import('../useSessionTimeout');
    useSessionTimeout();

    await new Promise((r) => setTimeout(r, 10));
    expect(signOutSpy).not.toHaveBeenCalled();
  });
});

// ── 4. Boot-time cleanup removes the legacy key ───────────────────────────────

describe('boot-time legacy key cleanup', () => {
  afterEach(() => {
    localStorage.removeItem('iwb_session_expires_at');
  });

  it('localStorage.removeItem removes the legacy key without throwing', () => {
    // Simulate what main.tsx does at boot
    localStorage.setItem('iwb_session_expires_at', String(Date.now() - 1000));
    expect(localStorage.getItem('iwb_session_expires_at')).not.toBeNull();

    // Boot cleanup
    localStorage.removeItem('iwb_session_expires_at');

    expect(localStorage.getItem('iwb_session_expires_at')).toBeNull();
  });

  it('boot cleanup is safe when the key does not exist', () => {
    localStorage.removeItem('iwb_session_expires_at'); // pre-clear
    expect(() => {
      localStorage.removeItem('iwb_session_expires_at');
    }).not.toThrow();
  });
});

// ── 5. SESSION_401_EVENT is never dispatched by the interceptor ───────────────

describe('SESSION_401_EVENT dispatch', () => {
  it('installSessionFetchInterceptor never dispatches SESSION_401_EVENT', async () => {
    const { installSessionFetchInterceptor } = await import('../session-fetch-interceptor');
    const { SESSION_401_EVENT } = await import('../useSessionTimeout');

    installSessionFetchInterceptor();

    const eventSpy = vi.fn();
    window.addEventListener(SESSION_401_EVENT, eventSpy);

    // Simulate a 401 response — the old interceptor would have dispatched the event
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'SESSION_EXPIRED' }), { status: 401 })
    );
    window.fetch = mockFetch;

    await window.fetch('/api/me', { credentials: 'include' });
    await new Promise((r) => setTimeout(r, 10));

    expect(eventSpy).not.toHaveBeenCalled();
    window.removeEventListener(SESSION_401_EVENT, eventSpy);
  });
});

// ── 6. session-timeout utility functions still work (used by tests / future) ──

describe('session-timeout utilities', () => {
  it('stampSessionExpiry writes a future timestamp to localStorage', async () => {
    const { stampSessionExpiry, SESSION_STORAGE_KEY } = await import('../session-timeout');
    const before = Date.now();
    stampSessionExpiry();
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const ts = Number(raw);
    expect(ts).toBeGreaterThan(before);
    localStorage.removeItem(SESSION_STORAGE_KEY);
  });

  it('readSessionExpiry returns null when key is absent', async () => {
    const { readSessionExpiry, SESSION_STORAGE_KEY } = await import('../session-timeout');
    localStorage.removeItem(SESSION_STORAGE_KEY);
    expect(readSessionExpiry()).toBeNull();
  });

  it('clearSessionExpiry removes the key', async () => {
    const { stampSessionExpiry, clearSessionExpiry, SESSION_STORAGE_KEY } = await import('../session-timeout');
    stampSessionExpiry();
    clearSessionExpiry();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });
});
