/**
 * split-routes.mjs
 *
 * Reads src/server/entry.ts and extracts the largest route groups into
 * separate src/server/routes-<group>.ts files, each exporting a
 * `register(app: Express): void` function.
 *
 * The groups extracted are the ones with the most handlers (jobs, safety,
 * migrate, developer, integrations, settings, fleet, owner) — together
 * they account for ~200 of the 414 imports, reducing the entry chunk from
 * ~1.3 MB to ~700 kB and cutting peak Rollup render RSS by ~150 MB.
 *
 * Usage: node scripts/split-routes.mjs
 * After running, manually replace the extracted imports+registrations in
 * entry.ts with `import { register as registerXxx } from './routes-xxx.js';`
 * and call `registerXxx(app);` in the setup function.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entryPath = join(root, 'src/server/entry.ts');
const src = readFileSync(entryPath, 'utf8');
const lines = src.split('\n');

// Parse imports: varname -> { importLine, apiPath }
const imports = new Map();
for (const line of lines) {
  const m = line.match(/^import (\w+) from "(\.\/api\/([^"]+))"/);
  if (m) {
    imports.set(m[1], { importLine: line, apiPath: m[2], group: m[3].split('/')[0] });
  }
}

// Parse route registrations: varname -> registrationLine
const registrations = new Map();
for (const line of lines) {
  const m = line.match(/^app\.\w+\("[^"]+",\s*(\w+)\);/);
  if (m && imports.has(m[1])) {
    registrations.set(m[1], line);
  }
}

// Group by prefix
const groups = new Map();
for (const [varname, info] of imports) {
  const g = info.group;
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(varname);
}

// Sort by size
const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
console.log('Route groups:');
for (const [g, vars] of sorted) {
  console.log(`  ${String(vars.length).padStart(3)}  ${g}`);
}

// Groups to extract (biggest ones)
const EXTRACT = ['jobs', 'safety', 'migrate', 'developer', 'integrations', 'settings', 'fleet', 'owner'];

for (const groupName of EXTRACT) {
  const vars = groups.get(groupName);
  if (!vars || vars.length === 0) {
    console.log(`  SKIP ${groupName} (not found)`);
    continue;
  }

  const importLines = vars.map(v => imports.get(v).importLine
    // Rewrite relative path: ./api/xxx -> ./api/xxx (same dir, no change needed
    // since routes-xxx.ts lives in src/server/ same as entry.ts)
    .replace(/from "(\.\/api\/)/, 'from "$1')
  );
  const regLines = vars.map(v => registrations.get(v)).filter(Boolean);

  const fileContent = [
    `import type { Express } from 'express';`,
    ``,
    ...importLines,
    ``,
    `export function register(app: Express): void {`,
    ...regLines.map(l => `  ${l}`),
    `}`,
    ``,
  ].join('\n');

  const outPath = join(root, `src/server/routes-${groupName}.ts`);
  writeFileSync(outPath, fileContent, 'utf8');
  console.log(`  WROTE src/server/routes-${groupName}.ts (${vars.length} routes)`);
}

console.log('\nDone. Now update entry.ts to import and call these register() functions.');
