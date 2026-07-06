/**
 * lazify-handlers.mjs
 *
 * Converts specific static handler imports in entry.ts and routes-safety.ts
 * to lazy wrappers (dynamic import on first call). This removes those modules
 * from Rollup's static module graph, reducing peak transform-phase RSS.
 *
 * Targets:
 *   entry.ts:
 *     - dazza/chat/POST (84 kB) — large AI handler, not on hot path
 *     - form-templates/seed/POST (33 kB) — admin seed endpoint
 *     - all migrate-* handlers (26 × ~5 kB each) — one-time migration ops
 *
 *   routes-safety.ts:
 *     - safety/swms/seed/POST (25 kB) — admin seed endpoint
 *     - safety/plans/seed/POST (17 kB) — admin seed endpoint
 *
 * Pattern: replace
 *   import foo from "./api/some/path";
 *   ...
 *   app.post("/api/some/path", foo);
 *
 * with:
 *   // (import removed)
 *   ...
 *   app.post("/api/some/path", async (req, res, next) => {
 *     const { default: handler } = await import("./api/some/path.js");
 *     return handler(req, res, next);
 *   });
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function lazify(filePath, targetVarPrefixes) {
  let src = readFileSync(filePath, 'utf8');
  const lines = src.split('\n');

  // Build map: varname -> importPath for targets
  const lazyMap = new Map(); // varname -> importPath (without extension)
  for (const line of lines) {
    const m = line.match(/^import (\w+) from "(\.\/api\/[^"]+)"/);
    if (!m) continue;
    const varname = m[1];
    const importPath = m[2];
    if (targetVarPrefixes.some(p => varname.startsWith(p))) {
      lazyMap.set(varname, importPath);
    }
  }

  console.log(`  ${filePath}: lazifying ${lazyMap.size} handlers`);

  // Remove import lines for targets
  const newLines = lines.filter(line => {
    const m = line.match(/^import (\w+) from/);
    return !(m && lazyMap.has(m[1]));
  });

  // Replace route registrations with lazy wrappers
  const result = newLines.map(line => {
    const m = line.match(/^(app\.\w+\("[^"]+",\s*)(\w+)(\);)$/);
    if (!m) return line;
    const varname = m[2];
    if (!lazyMap.has(varname)) return line;
    const importPath = lazyMap.get(varname);
    // Add .js extension for ESM compatibility in the built bundle
    const importPathJs = importPath.endsWith('.js') ? importPath : importPath + '.js';
    return `${m[1]}async (req, res, next) => { const { default: h } = await import("${importPathJs}"); return h(req, res, next); }${m[3]}`;
  });

  writeFileSync(filePath, result.join('\n'), 'utf8');
  return lazyMap.size;
}

// entry.ts: lazify dazza/chat, form-templates/seed, all migrate-*
const entryCount = lazify(
  join(root, 'src/server/entry.ts'),
  ['dazza_chat_post_', 'form_templates_seed_post_', 'migrate_'],
);

// routes-safety.ts: lazify seed endpoints
const safetyCount = lazify(
  join(root, 'src/server/routes-safety.ts'),
  ['safety_plans_seed_post_', 'safety_swms_seed_post_'],
);

console.log(`\nTotal lazified: ${entryCount + safetyCount} handlers`);
