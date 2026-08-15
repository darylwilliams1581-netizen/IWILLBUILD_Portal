import { execSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Build client assets
execSync("npx vite build --outDir dist/client", {
  stdio: "inherit",
  shell: true
});

// Build SSR server bundle — outputs dist/server.bundle.mjs via vite.config.ts SSR branch
execSync("npx vite build --ssr", {
  stdio: "inherit",
  shell: true
});

// ── Post-build: ensure #airo/secrets resolves in the publish container ────────
//
// The publish container runs `node /app/dist/server.bundle.mjs` (or
// `./server.bundle.mjs` from /app).  Node resolves package `imports` maps by
// walking up from the importing file's directory.  The bundle lives at
// dist/server.bundle.mjs, so Node looks for package.json in dist/ first.
//
// The root package.json maps  "#airo/secrets" → "./export-plugins/airo-secrets.ts"
// which is a TypeScript source file — Node cannot execute it directly.
//
// Fix: write a compiled ESM shim into dist/airo-secrets.mjs and drop a
// minimal package.json into dist/ that maps "#airo/secrets" to that shim.
// Node finds dist/package.json first and resolves the .mjs file correctly.
//
// In the platform's managed injection flow the platform may override this shim
// with its own implementation — that's fine, this is only a fallback that reads
// from process.env (same behaviour as the dev shim).

// ── Shim: mirrors /app/airo-secrets/src/secrets-utils.ts exactly ─────────────
//
// Reference: /app/airo-secrets/src/secrets-utils.ts
//
// The platform writes secrets to $NOMAD_TASK_DIR/config.json (default /local/config.json)
// in the format: { "SECRET_NAME": { "VALUE": "...", "SYSTEM_MANAGED": false } }
//
// Key behaviours that must match the reference:
//   1. readConfig() THROWS on failure — no caching of failure state.
//      If config.json is temporarily absent, the next call retries the disk read.
//   2. getSecret() catches the throw and returns null (not '').
//   3. SYSTEM_MANAGED=true → null (not '').
//   4. Missing key → null (not '').
//   5. listSecretNames() returns sorted array of non-system-managed key names.
//   6. Falls back to process.env ONLY when config.json is absent (dev/CI).
//      In production the file is always present; process.env fallback is dev-only.
//
// Return type: string | object | null  (matches reference exactly)
const shimSrc = `
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Successful parse is cached to avoid repeated disk reads.
// Failure is NOT cached — readConfig() throws, so the next call retries.
let _configCache = null;
let _configLoaded = false;

function readConfig() {
  if (_configLoaded) return _configCache;
  const configPath = join(process.env.NOMAD_TASK_DIR || '/local', 'config.json');
  // Throws if file is absent or unparseable — caller catches.
  const content = readFileSync(configPath, 'utf8');
  _configCache = JSON.parse(content);
  _configLoaded = true;
  return _configCache;
}

function isNonSystemManagedSecret(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    'VALUE' in value &&
    'SYSTEM_MANAGED' in value &&
    value.SYSTEM_MANAGED === false
  );
}

export function getSecret(name) {
  try {
    const config = readConfig();
    if (!(name in config)) return null;
    const entry = config[name];
    if (!isNonSystemManagedSecret(entry)) return null;
    return entry.VALUE;
  } catch {
    // config.json absent — dev/CI fallback to process.env.
    // Returns null (not '') if the env var is also absent, matching reference behaviour.
    const v = process.env[name];
    return v !== undefined ? v : null;
  }
}

export function listSecretNames() {
  try {
    const config = readConfig();
    return Object.entries(config)
      .filter(([, v]) => isNonSystemManagedSecret(v))
      .map(([k]) => k)
      .sort();
  } catch {
    return [];
  }
}
`.trimStart();

writeFileSync(path.join(root, "dist", "airo-secrets.mjs"), shimSrc, "utf8");

const distPkg = {
  type: "module",
  imports: {
    "#airo/secrets": "./airo-secrets.mjs"
  }
};

writeFileSync(
  path.join(root, "dist", "package.json"),
  JSON.stringify(distPkg, null, 2) + "\n",
  "utf8"
);

console.log("[publish-build] wrote dist/airo-secrets.mjs and dist/package.json");
