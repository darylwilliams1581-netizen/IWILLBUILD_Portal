#!/usr/bin/env node
/**
 * rewrite-entry-dynamic.mjs
 *
 * Rewrites src/server/entry.ts so that all API handler imports inside the
 * // <api-imports> … // </api-imports> block are converted from static imports
 * to inline dynamic imports at the point of route registration.
 *
 * BEFORE:
 *   import foo_get_0 from "./api/foo/GET";
 *   ...
 *   app.get("/api/foo", foo_get_0);
 *
 * AFTER:
 *   // (import removed)
 *   ...
 *   app.get("/api/foo", /* @vite-ignore *\/ async (req, res, next) => { try { const m = await import("./api/foo/GET"); return m.default(req, res, next); } catch(e) { next(e); } });
 *
 * This lets Rollup split every handler into its own chunk (or merge small ones)
 * without holding all 400+ handler ASTs in memory simultaneously during the
 * render phase, which was causing the SSR build to OOM at ~885 MB.
 *
 * The script is idempotent: if the imports are already gone it only rewrites
 * the app.METHOD lines that still reference the old variable names.
 *
 * Usage:  node scripts/rewrite-entry-dynamic.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entryPath = join(root, 'src', 'server', 'entry.ts');

let src = readFileSync(entryPath, 'utf8');

// ── Step 1: Parse the <api-imports> block ─────────────────────────────────────
// Build a map: variableName → relative module path
// e.g. "foo_get_0" → "./api/foo/GET"

const importBlockMatch = src.match(/\/\/ <api-imports>([\s\S]*?)\/\/ <\/api-imports>/);
if (!importBlockMatch) {
  console.log('[rewrite-entry-dynamic] No <api-imports> block found — nothing to do.');
  process.exit(0);
}

const importBlock = importBlockMatch[1];
// Match lines like: import foo_get_0 from "./api/foo/GET";
const importLineRe = /^import\s+(\w+)\s+from\s+"([^"]+)";/gm;
const varToPath = new Map();
let m;
while ((m = importLineRe.exec(importBlock)) !== null) {
  varToPath.set(m[1], m[2]);
}

if (varToPath.size === 0) {
  console.log('[rewrite-entry-dynamic] No handler imports found in <api-imports> block — nothing to do.');
  process.exit(0);
}

console.log(`[rewrite-entry-dynamic] Found ${varToPath.size} handler imports to convert.`);

// ── Step 2: Remove the entire <api-imports> block ─────────────────────────────
// Replace it with a comment so the markers are preserved for future runs.
src = src.replace(
  /\/\/ <api-imports>[\s\S]*?\/\/ <\/api-imports>/,
  '// <api-imports>\n// (converted to dynamic imports at registration point — see rewrite-entry-dynamic.mjs)\n// </api-imports>',
);

// ── Step 3: Replace each app.METHOD(path, varName_N) with a dynamic wrapper ──
// Pattern: app.get("/api/...", varName_N);
//          app.post("/api/...", varName_N);
//          etc.
//
// We sort by variable name length descending to avoid partial-match issues
// (e.g. "foo_10" matching before "foo_1").
const sortedVars = [...varToPath.keys()].sort((a, b) => b.length - a.length);

let replacements = 0;
for (const varName of sortedVars) {
  const modulePath = varToPath.get(varName);
  // Match: app.METHOD("...", varName); — with optional trailing whitespace/newline
  // The variable name appears as the last argument before the closing );
  const re = new RegExp(
    `(app\\.(?:get|post|put|patch|delete|options|head)\\([^)]+,\\s*)${varName}(\\s*\\))`,
    'g',
  );
  const replacement =
    `$1/* @vite-ignore */ async (req, res, next) => { try { const _m = await import("${modulePath}"); return _m.default(req, res, next); } catch(_e) { next(_e); } }$2`;
  const before = src;
  src = src.replace(re, replacement);
  if (src !== before) replacements++;
}

console.log(`[rewrite-entry-dynamic] Replaced ${replacements} route registrations with dynamic wrappers.`);

if (replacements === 0) {
  console.log('[rewrite-entry-dynamic] No registrations matched — entry.ts may already be converted.');
  process.exit(0);
}

// ── Step 4: Write the result ──────────────────────────────────────────────────
writeFileSync(entryPath, src, 'utf8');
console.log(`[rewrite-entry-dynamic] Written: ${entryPath}`);
console.log('[rewrite-entry-dynamic] Done.');
