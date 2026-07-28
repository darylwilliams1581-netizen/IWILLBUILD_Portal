/**
 * Test stub for src/server/db/config.ts
 *
 * Returns safe dummy credentials so getDatabaseCredentials() never reads
 * /local/config.json during Vitest runs.
 *
 * Type is declared inline — do NOT import from the real config.ts because
 * that file is itself aliased to this stub, which would create a circular
 * reference.
 */

export interface DatabaseCredentials {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function getDatabaseCredentials(): DatabaseCredentials {
  return {
    host: '127.0.0.1',
    port: 3306,
    user: 'test',
    password: 'test',
    database: 'test_db',
  };
}
