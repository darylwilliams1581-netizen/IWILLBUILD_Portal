/**
 * Dev-server shim for #airo/secrets.
 *
 * In production the Rollup external() function prevents this file from being
 * bundled; the platform injects the real implementation at runtime.
 *
 * In the Vite dev server (ssrLoadModule / module-runner) this shim is loaded
 * instead. It uses the same resolution strategy as the production shim:
 *
 *   1. If $NOMAD_TASK_DIR is set (running inside the platform container, even
 *      in dev/preview mode), read from $NOMAD_TASK_DIR/config.json.
 *      This is the live path — the platform writes all secrets there.
 *
 *   2. Otherwise fall back to process.env (local developer machines, CI).
 *
 * Return type matches the production reference: string | object | null.
 *   - null  → key absent, or SYSTEM_MANAGED=true
 *   - ''    → key present but VALUE is empty string
 *   - value → key present, SYSTEM_MANAGED=false, VALUE non-empty
 *
 * NEVER log, return, display or send secret values.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Successful parse is cached to avoid repeated disk reads.
// Failure is NOT cached — readConfig() throws, so the next call retries.
// This matches the production reference behaviour exactly.
let _configCache: Record<string, { VALUE: unknown; SYSTEM_MANAGED: boolean }> | null = null;
let _configLoaded = false;

function readConfig(): Record<string, { VALUE: unknown; SYSTEM_MANAGED: boolean }> | null {
  if (_configLoaded) return _configCache;
  const nomadDir = process.env.NOMAD_TASK_DIR;
  if (!nomadDir) {
    // Not running inside the platform container — skip config.json entirely.
    _configLoaded = true;
    _configCache = null;
    return null;
  }
  const configPath = join(nomadDir, 'config.json');
  // Throws if file is absent or unparseable — caller catches.
  const content = readFileSync(configPath, 'utf8');
  _configCache = JSON.parse(content) as Record<string, { VALUE: unknown; SYSTEM_MANAGED: boolean }>;
  _configLoaded = true;
  return _configCache;
}

function isNonSystemManaged(entry: unknown): entry is { VALUE: unknown; SYSTEM_MANAGED: false } {
  return (
    entry !== null &&
    typeof entry === 'object' &&
    'VALUE' in (entry as object) &&
    'SYSTEM_MANAGED' in (entry as object) &&
    (entry as { SYSTEM_MANAGED: unknown }).SYSTEM_MANAGED === false
  );
}

export function getSecret(name: string): string | object | null {
  try {
    const config = readConfig();
    if (config !== null) {
      if (!(name in config)) return null;
      const entry = config[name];
      if (!isNonSystemManaged(entry)) return null;
      return entry.VALUE as string | object;
    }
  } catch {
    // config.json absent or unreadable — fall through to process.env
  }
  // Local dev / CI fallback: process.env
  const v = process.env[name];
  return v !== undefined ? v : null;
}

export function listSecretNames(): string[] {
  try {
    const config = readConfig();
    if (config !== null) {
      return Object.entries(config)
        .filter(([, v]) => isNonSystemManaged(v))
        .map(([k]) => k)
        .sort();
    }
  } catch {
    // ignore
  }
  return [];
}
