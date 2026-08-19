/**
 * Test stub for src/lib/auth/auth.ts
 *
 * Replaces the real BetterAuth instance in Vitest runs so that handler unit
 * tests can control session outcomes without a real auth server or secret.
 *
 * Usage in tests:
 *   import { __setMockSession } from '@/test/stubs/auth.stub';
 *   __setMockSession(null);                    // → getSession returns null → 401
 *   __setMockSession({ user: { id: 'u1' } }); // → getSession returns session
 */

let _session: { user: { id: string } } | null = null;

/** Called by tests to set the session returned by getSession. */
export function __setMockSession(s: { user: { id: string } } | null) {
  _session = s;
}

export function getAuth() {
  return {
    api: {
      getSession: async (_opts?: unknown) => _session,
    },
    handler: async () => new Response('', { status: 200 }),
  };
}
