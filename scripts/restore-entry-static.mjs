#!/usr/bin/env node
/**
 * restore-entry-static.mjs
 *
 * Reverses the dynamic-import conversion done by rewrite-entry-dynamic.mjs.
 * Converts every inline dynamic import wrapper back to:
 *   1. A static import at the top of the file (inside <api-imports> block)
 *   2. A direct handler reference at the app.METHOD() call site
 *
 * BEFORE:
 *   app.post("/api/foo", async (req, res, next) => { const _m = await import("./api/foo/POST"); return _m.default(req,res,next); });
 *
 * AFTER:
 *   // in <api-imports> block:
 *   import _h_foo_post from "./api/foo/POST";
 *   // at registration:
 *   app.post("/api/foo", _h_foo_post);
 *
 * This allows Rollup to tree-shake the handler modules during the SSR build,
 * reducing peak memory usage significantly compared to dynamic imports which
 * force Rollup to hold all 400+ handler ASTs in memory simultaneously.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entryPath = join(root, 'src', 'server', 'entry.ts');

let src = readFileSync(entryPath, 'utf8');

// Match every dynamic import wrapper on a route registration line:
// app.METHOD("...", /* @vite-ignore */ async (req, res, next) => { try { const _m = await import("./api/..."); return _m.default(req, res, next); } catch(_e) { next(_e); } });
const dynRe = /app\.(get|post|put|patch|delete|options|head)\(("\/[^"]*"),\s*\/\*\s*@vite-ignore\s*\*\/\s*async\s*\(req,\s*res,\s*next\)\s*=>\s*\{\s*try\s*\{\s*const\s+_m\s*=\s*await\s+import\("([^"]+)"\);\s*return\s+_m\.default\(req,\s*res,\s*next\);\s*\}\s*catch\(_e\)\s*\{\s*next\(_e\);\s*\}\s*\}\)/g;

const imports = [];
const varNames = new Map(); // modulePath → varName

let counter = 0;
let converted = 0;

// First pass: collect all unique module paths and assign variable names
let m;
while ((m = dynRe.exec(src)) !== null) {
  const modulePath = m[3];
  if (!varNames.has(modulePath)) {
    // Generate a safe variable name from the module path
    // e.g. "./api/auth/change-email/POST" → "_h_auth_change_email_post_0"
    const safeName = '_h_' + modulePath
      .replace(/^\.\/api\//, '')
      .replace(/\//g, '_')
      .replace(/-/g, '_')
      .replace(/\[/g, '')
      .replace(/\]/g, '')
      .toLowerCase() + '_' + counter++;
    varNames.set(modulePath, safeName);
    imports.push(`import ${safeName} from "${modulePath}";`);
  }
}

console.log(`[restore-entry-static] Found ${varNames.size} unique handler modules.`);

if (varNames.size === 0) {
  console.log('[restore-entry-static] No dynamic imports found — nothing to do.');
  process.exit(0);
}

// Second pass: replace each dynamic wrapper with the static variable reference
dynRe.lastIndex = 0;
src = src.replace(dynRe, (match, method, path, modulePath) => {
  const varName = varNames.get(modulePath);
  converted++;
  return `app.${method}(${path}, ${varName})`;
});

console.log(`[restore-entry-static] Replaced ${converted} dynamic wrappers with static references.`);

// Third pass: replace the <api-imports> placeholder comment with real static imports
const importBlock = imports.join('\n');
if (src.includes('// <api-imports>')) {
  src = src.replace(
    /\/\/ <api-imports>[\s\S]*?\/\/ <\/api-imports>/,
    `// <api-imports>\n${importBlock}\n// </api-imports>`
  );
  console.log(`[restore-entry-static] Inserted ${imports.length} static imports into <api-imports> block.`);
} else {
  // No marker — prepend imports after the last top-level import line
  const lastImportIdx = src.lastIndexOf('\nimport ');
  const insertAt = src.indexOf('\n', lastImportIdx + 1) + 1;
  src = src.slice(0, insertAt) +
    `\n// <api-imports>\n${importBlock}\n// </api-imports>\n` +
    src.slice(insertAt);
  console.log(`[restore-entry-static] Inserted ${imports.length} static imports (no marker found, prepended).`);
}

writeFileSync(entryPath, src, 'utf8');
console.log(`[restore-entry-static] Written: ${entryPath}`);
console.log('[restore-entry-static] Done.');
