/**
 * Test/local-dev fallback for #airo/secrets.
 *
 * In the builder sandbox the real airo-secrets package reads secrets from
 * /local/config.json (a Nomad task-local file). That path does not exist
 * during local development or Vitest runs, so this fallback is aliased in
 * vitest.config.ts to satisfy the import without crashing.
 *
 * Behaviour:
 *  - In test/dev: reads from process.env, returns null (not throws) when
 *    the variable is absent — matching the production contract.
 *  - Never throws on a missing secret; callers already guard for null.
 *
 * Production code is NOT affected — the alias only applies inside Vitest.
 */

export function getSecret(secretName: string): string | object | null {
  const val = process.env[secretName];
  return val !== undefined ? val : null;
}

export function listSecretNames(): string[] {
  // Return env var names that look like secrets (non-empty, uppercase).
  return Object.keys(process.env).filter(
    (k) => k === k.toUpperCase() && process.env[k],
  );
}
