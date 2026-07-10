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
 *   db              — chainable no-op Proxy
 *   testConnection  — async noop returning true
 *   closeConnection — async noop
 */

// NOTE: vi is imported lazily inside the factory so this file is safe to
// import in both test and (accidentally) non-test contexts.
import { vi } from 'vitest';

/** Chainable no-op proxy — absorbs .select().from().where()... etc. */
function makeChain(): unknown {
  const h: ProxyHandler<object> = {
    get: () => (..._a: unknown[]) => new Proxy({}, h),
    apply: () => new Proxy({}, h),
  };
  return new Proxy({}, h);
}

export const db = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === 'execute') return vi.fn().mockResolvedValue([[], []]);
      if (prop === 'transaction')
        return vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
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
