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
// The platform writes secrets to $NOMAD_TASK_DIR/config.json (default /local/config.json)
// in the format: { "SECRET_NAME": { "VALUE": "...", "SYSTEM_MANAGED": false } }
//
// Only secrets with SYSTEM_MANAGED=false are accessible.
// Falls back to process.env for local dev and CI where config.json is absent.
const shimSrc = `
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Cache parsed config to avoid repeated disk reads per request
let _configCache = null;
let _configReadAttempted = false;

function readConfig() {
  if (_configReadAttempted) return _configCache;
  _configReadAttempted = true;
  const configPath = join(process.env.NOMAD_TASK_DIR || '/local', 'config.json');
  try {
    const content = readFileSync(configPath, 'utf8');
    _configCache = JSON.parse(content);
  } catch {
    // config.json absent (dev/CI) — fall back to process.env
    _configCache = null;
  }
  return _configCache;
}

export function getSecret(name) {
  const config = readConfig();
  if (config !== null) {
    const entry = config[name];
    if (
      entry !== null &&
      typeof entry === 'object' &&
      'VALUE' in entry &&
      'SYSTEM_MANAGED' in entry &&
      entry.SYSTEM_MANAGED === false
    ) {
      return typeof entry.VALUE === 'string' ? entry.VALUE : JSON.stringify(entry.VALUE);
    }
    // Key absent or SYSTEM_MANAGED=true — do NOT fall through to process.env
    // (system-managed secrets must remain inaccessible)
    return '';
  }
  // config.json not available — dev/CI fallback
  return process.env[name] ?? '';
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
