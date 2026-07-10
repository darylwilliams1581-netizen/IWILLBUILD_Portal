/**
 * Test stub for src/server/db/client.ts
 *
 * Replaces the real Drizzle/MySQL2 client in Vitest runs so that importing
 * entry.ts (and the hundreds of API handlers it pulls in) never attempts to
 * read /local/config.json or open a MySQL connection.
 *
 * Aliased in vitest.config.ts via:
 *   '#db-client-stub' → this file   (used by vi.mock factory)
 *   'src/server/db/client.ts'        → this file   (resolved path mock)
 *
 * The stub exports the same surface as the real client:
 *   db              — a proxy that returns a chainable no-op for every method
 *   testConnection  — async noop returning true
 *   closeConnection — async noop
 */

import { vi } from 'vitest';

/** Chainable no-op proxy — handles .select().from().where()... etc. */
function makeChain(): unknown {
  const handler: ProxyHandler<object> = {
    get(_target, _prop) {
      // Return a function that returns another proxy (for chaining)
      return (..._args: unknown[]) => new Proxy({}, handler);
    },
    apply(_target, _thisArg, _args) {
      return new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

export const db = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === 'execute') return vi.fn().mockResolvedValue([[], []]);
      if (prop === 'transaction') {
        return vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) =>
          fn(db),
        );
      }
      // select / insert / update / delete / query / etc.
      return (..._args: unknown[]) => makeChain();
    },
  },
);

export const testConnection = vi.fn().mockResolvedValue(true);
export const closeConnection = vi.fn().mockResolvedValue(undefined);
