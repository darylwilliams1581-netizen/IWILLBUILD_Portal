/**
 * apply-route-split.mjs
 *
 * Patches src/server/entry.ts to:
 *   1. Remove the import lines for the extracted route groups
 *   2. Add `import { register as registerXxx } from './routes-xxx.js';` lines
 *   3. Remove the app.xxx() registration lines for those groups
 *   4. Add `registerXxx(app);` calls in their place (after the auth middleware setup)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entryPath = join(root, 'src/server/entry.ts');
let src = readFileSync(entryPath, 'utf8');
const lines = src.split('\n');

// Groups that were extracted
const EXTRACTED_GROUPS = ['jobs', 'safety', 'developer', 'integrations', 'settings', 'fleet'];

// Parse imports to find which varnames belong to extracted groups
const extractedVars = new Set();
for (const line of lines) {
  const m = line.match(/^import (\w+) from "(\.\/api\/([^/"]+))/);
  if (m && EXTRACTED_GROUPS.includes(m[3])) {
    extractedVars.add(m[1]);
  }
}

console.log(`Found ${extractedVars.size} vars to extract`);

// Build new lines array
const newLines = [];
let inImportBlock = false;
let addedGroupImports = false;
let firstRouteRegSeen = false;
let addedGroupRegistrations = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Detect start of api-imports block
  if (line.trim() === '// <api-imports>') {
    inImportBlock = true;
    newLines.push(line);
    continue;
  }
  if (line.trim() === '// </api-imports>') {
    inImportBlock = false;
    // Inject the group imports right before closing tag
    if (!addedGroupImports) {
      newLines.push('');
      newLines.push('// Route group modules (split out to reduce entry chunk size)');
      for (const g of EXTRACTED_GROUPS) {
        const camel = g.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        newLines.push(`import { register as register_${camel} } from './routes-${g}.js';`);
      }
      addedGroupImports = true;
    }
    newLines.push(line);
    continue;
  }

  // Skip extracted import lines
  if (inImportBlock) {
    const m = line.match(/^import (\w+) from/);
    if (m && extractedVars.has(m[1])) {
      continue; // drop this import
    }
  }

  // Skip extracted route registration lines
  const regMatch = line.match(/^app\.\w+\("[^"]+",\s*(\w+)\);/);
  if (regMatch && extractedVars.has(regMatch[1])) {
    // On first skipped registration, inject group register() calls
    if (!addedGroupRegistrations) {
      newLines.push('');
      newLines.push('  // Register route groups (split from entry to reduce chunk size)');
      for (const g of EXTRACTED_GROUPS) {
        const camel = g.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        newLines.push(`  register_${camel}(app);`);
      }
      addedGroupRegistrations = true;
    }
    continue; // drop the individual registration
  }

  newLines.push(line);
}

const result = newLines.join('\n');
writeFileSync(entryPath, result, 'utf8');

const origCount = lines.filter(l => /^import \w+ from "\.\/api\//.test(l)).length;
const newCount = newLines.filter(l => /^import \w+ from "\.\/api\//.test(l)).length;
console.log(`Import lines: ${origCount} → ${newCount} (removed ${origCount - newCount})`);

const origReg = lines.filter(l => /^app\.\w+\("[^"]+", \w+\);/.test(l)).length;
const newReg = newLines.filter(l => /^app\.\w+\("[^"]+", \w+\);/.test(l)).length;
console.log(`Route registrations: ${origReg} → ${newReg} (removed ${origReg - newReg})`);
console.log('Done.');
