/**
 * lazify-all-handlers.mjs
 *
 * Converts ALL static API handler imports in entry.ts and routes-safety.ts
 * to inline dynamic-import wrappers. This removes every handler module from
 * Rollup's static module graph, cutting SSR peak RSS enough to build with
 * plain `vite build --ssr` and no extra heap flags.
 *
 * Safe to re-run — already-lazified handlers are left untouched.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function lazifyAll(filePath) {
  let src = readFileSync(filePath, 'utf8');
  const lines = src.split('\n');

  // Collect all static API handler imports: import <var> from "./api/..."
  const importMap = new Map(); // varname -> importPath (no extension)
  for (const line of lines) {
    const m = line.match(/^import (\w+) from ["'](\.\/api\/[^"']+)["']/);
    if (!m) continue;
    importMap.set(m[1], m[2]);
  }

  console.log(`  ${filePath}: found ${importMap.size} static API imports to lazify`);

  // Remove all matched import lines
  const withoutImports = lines.filter(line => {
    const m = line.match(/^import (\w+) from/);
    return !(m && importMap.has(m[1]));
  });

  // Replace route registrations: app.METHOD("...", varname); -> dynamic wrapper
  let lazified = 0;
  const result = withoutImports.map(line => {
    // Match: app.METHOD("/path", varname);
    // Allow optional spaces, and the varname must be in our importMap
    const m = line.match(/^(app\.\w+\("[^"]+",\s*)(\w+)(\);)$/);
    if (!m) return line;
    const varname = m[2];
    if (!importMap.has(varname)) return line;
    const importPath = importMap.get(varname);
    const importPathJs = importPath.endsWith('.js') ? importPath : importPath + '.js';
    lazified++;
    return `${m[1]}/* @vite-ignore */ async (req, res, next) => { try { const _m = await import("${importPathJs}"); return _m.default(req, res, next); } catch(_e) { next(_e); } }${m[3]}`;
  });

  writeFileSync(filePath, result.join('\n'), 'utf8');
  console.log(`  ${filePath}: lazified ${lazified} route registrations`);
  return lazified;
}

const entryCount = lazifyAll(join(root, 'src/server/entry.ts'));
const safetyCount = lazifyAll(join(root, 'src/server/routes-safety.ts'));

console.log(`\nTotal lazified: ${entryCount + safetyCount} handlers`);
