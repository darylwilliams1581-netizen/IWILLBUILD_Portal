#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const routeFiles = [
  'src/server/routes-safety.ts',
  'src/server/routes-developer.ts',
  'src/server/routes-fleet.ts',
  'src/server/routes-integrations.ts',
  'src/server/routes-jobs.ts',
  'src/server/routes-settings.ts',
];

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

const groupRoutes = new Set();
for (const f of routeFiles) {
  for (const [method, path] of extractRoutes(f)) {
    groupRoutes.add(`${method} ${path}`);
  }
}
console.log(`Routes in route group files: ${groupRoutes.size}`);

const entryRoutes = extractRoutes('src/server/entry.ts');
console.log(`Routes in entry.ts: ${entryRoutes.length}`);

const dupes = entryRoutes.filter(([m, p]) => groupRoutes.has(`${m} ${p}`));
console.log(`\nDuplicates (in both): ${dupes.length}`);
for (const [m, p] of dupes.sort((a,b) => a[1].localeCompare(b[1]))) {
  console.log(`  ${m.toUpperCase()} ${p}`);
}
