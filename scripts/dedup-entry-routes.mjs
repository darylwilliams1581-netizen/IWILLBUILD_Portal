#!/usr/bin/env node
/**
 * dedup-entry-routes.mjs
 *
 * Removes from src/server/entry.ts every route registration (and its
 * corresponding static import) that is already registered in one of the
 * route group files (routes-safety.ts, routes-jobs.ts, etc.).
 *
 * The route group files are separate Rollup entry points — their handlers
 * are bundled in a separate pass. Having the same route in both entry.ts
 * AND a route group file causes:
 *   1. Duplicate Express route registrations at runtime (first one wins,
 *      second is silently ignored — but both handlers are bundled).
 *   2. Rollup must bundle the handler module TWICE (once per entry point
 *      that statically imports it), doubling the memory cost for those 169
 *      handlers during the SSR build.
 *
 * After this script runs, entry.ts only contains routes that are NOT in
 * any route group file. The route group files remain unchanged.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const routeGroupFiles = [
  'src/server/routes-safety.ts',
  'src/server/routes-developer.ts',
  'src/server/routes-fleet.ts',
  'src/server/routes-integrations.ts',
  'src/server/routes-jobs.ts',
  'src/server/routes-settings.ts',
];

// ── Step 1: Collect all (method, path) pairs from route group files ───────────
function extractRoutes(filepath) {
  try {
    const src = readFileSync(filepath, 'utf8');
    const re = /app\.(get|post|put|delete|patch|options|head)\("(\/[^"]*)"/g;
    const results = [];
    let m;
    while ((m = re.exec(src)) !== null) results.push([m[1].toLowerCase(), m[2]]);
    return results;
  } catch { return []; }
}

const groupRouteSet = new Set();
for (const f of routeGroupFiles) {
  for (const [method, path] of extractRoutes(f)) {
    groupRouteSet.add(`${method} ${path}`);
  }
}
console.log(`[dedup] Routes in route group files: ${groupRouteSet.size}`);

// ── Step 2: Read entry.ts ─────────────────────────────────────────────────────
const entryPath = join(root, 'src', 'server', 'entry.ts');
let src = readFileSync(entryPath, 'utf8');
const lines = src.split('\n');

// ── Step 3: Find which static imports in <api-imports> are used ONLY by
//            duplicate routes (i.e. routes that exist in route group files).
//            We need to:
//            a) Remove the app.METHOD() line for each duplicate route
//            b) Remove the static import for the handler IF that import is
//               not also used by a non-duplicate route in entry.ts.
// ─────────────────────────────────────────────────────────────────────────────

// Parse all app.METHOD lines: line index → { method, path, varName }
// Pattern: app.get("/api/foo", _h_foo_get_0);
const appLineRe = /^app\.(get|post|put|delete|patch|options|head)\("(\/[^"]*)",\s*(\w+)\s*\);$/;

const routeLines = []; // { lineIdx, method, path, varName }
for (let i = 0; i < lines.length; i++) {
  const trimmed = lines[i].trim();
  const m = appLineRe.exec(trimmed);
  if (m) {
    routeLines.push({ lineIdx: i, method: m[1].toLowerCase(), path: m[2], varName: m[3] });
  }
}
console.log(`[dedup] Total route registrations in entry.ts: ${routeLines.length}`);

// Identify duplicate route lines (those whose (method, path) is in groupRouteSet)
const dupLineIndices = new Set();
const dupVarNames = new Set();
const keepVarNames = new Set();

for (const { lineIdx, method, path, varName } of routeLines) {
  if (groupRouteSet.has(`${method} ${path}`)) {
    dupLineIndices.add(lineIdx);
    dupVarNames.add(varName);
  } else {
    keepVarNames.add(varName);
  }
}

// A var is safe to remove only if it's NOT used by any kept route
const removeVarNames = new Set([...dupVarNames].filter(v => !keepVarNames.has(v)));

console.log(`[dedup] Duplicate route lines to remove: ${dupLineIndices.size}`);
console.log(`[dedup] Handler imports to remove: ${removeVarNames.size}`);

// ── Step 4: Remove duplicate app.METHOD lines ─────────────────────────────────
const filteredLines = lines.filter((_, i) => !dupLineIndices.has(i));

// ── Step 5: Remove the static imports for removed handlers ────────────────────
// Static imports are inside the <api-imports> block:
// import _h_foo_get_0 from "./api/foo/GET";
const importLineRe = /^import\s+(\w+)\s+from\s+"[^"]+";$/;
let removedImports = 0;

const finalLines = filteredLines.filter(line => {
  const trimmed = line.trim();
  const m = importLineRe.exec(trimmed);
  if (m && removeVarNames.has(m[1])) {
    removedImports++;
    return false; // remove this import line
  }
  return true;
});

console.log(`[dedup] Import lines removed: ${removedImports}`);

// ── Step 6: Write result ──────────────────────────────────────────────────────
const result = finalLines.join('\n');
writeFileSync(entryPath, result, 'utf8');

const remainingRoutes = finalLines.filter(l => appLineRe.exec(l.trim())).length;
console.log(`[dedup] Remaining route registrations in entry.ts: ${remainingRoutes}`);
console.log(`[dedup] Written: ${entryPath}`);
console.log('[dedup] Done.');
