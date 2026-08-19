/**
 * Test stub for src/server/db/client.ts
 *
 * Replaces the real Drizzle/MySQL2 client in Vitest runs so that importing
 * entry.ts (and the hundreds of API handlers it pulls in) never attempts to
 * read /local/config.json or open a MySQL connection.
 *
 * Aliased in vitest.config.ts so every relative import of db/client(.js|.ts)
 * and the @/server/db/client alias both resolve here.
 *
 * Exports the same surface as the real client:
 *   db              — Proxy with controllable execute + query mocks
 *   testConnection  — async noop returning true
 *   closeConnection — async noop
 *
 * Tests that need to control db.execute return values should import
 * __dbExecuteMock and call .mockResolvedValue / .mockImplementation on it.
 *
 * Tests that need to control db.query.profiles.findFirst should import
 * __dbQueryProfilesMock and configure it similarly.
 */

import { vi } from 'vitest';

/** Chainable no-op proxy — absorbs .select().from().where()... etc. */
function makeChain(): unknown {
  const h: ProxyHandler<object> = {
    get: () => (..._a: unknown[]) => new Proxy({}, h),
    apply: () => new Proxy({}, h),
  };
  return new Proxy({}, h);
}

/**
 * Controllable execute mock — exported so tests can call
 * __dbExecuteMock.mockResolvedValue([[row], undefined]) etc.
 */
export const __dbExecuteMock = vi.fn().mockResolvedValue([[], undefined]);

/**
 * Controllable query.profiles.findFirst mock.
 * Default: returns null (no profile found).
 */
export const __dbQueryProfilesMock = vi.fn().mockResolvedValue(null);

export const db = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === 'execute') return __dbExecuteMock;
      if (prop === 'transaction')
        return vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
      if (prop === 'query') {
        return {
          profiles: { findFirst: __dbQueryProfilesMock },
          jobs: { findFirst: vi.fn().mockResolvedValue(null) },
        };
      }
      return (..._a: unknown[]) => makeChain();
    },
  },
);

export async function testConnection(): Promise<boolean> {
  return true;
}

export async function closeConnection(): Promise<void> {
  return;
}
