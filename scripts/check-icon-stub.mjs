import fs from 'fs';
import path from 'path';

function walk(dir) {
  const results = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) results.push(...walk(full));
    else if (f.endsWith('.tsx') || f.endsWith('.ts')) results.push(full);
  }
  return results;
}

const files = walk('src');
const icons = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const matches = src.match(/import\s*\{([^}]+)\}\s*from\s*'lucide-react'/g);
  if (!matches) continue;
  for (const imp of matches) {
    const inner = imp.replace(/import\s*\{/, '').replace(/\}\s*from.*/, '');
    for (const part of inner.split(',')) {
      // Strip alias: "Archive as _Archive" → "Archive" (the exported name, not the local alias)
      const name = part.trim().replace(/\s+as\s+\S+/, '').trim();
      if (name) icons.add(name);
    }
  }
}

const stub = fs.readFileSync('src/fallbacks/icon-stub.ts', 'utf8');
const missing = [...icons].filter(i => !stub.includes('export const ' + i)).sort();
console.log('MISSING:', JSON.stringify(missing));
console.log('TOTAL USED:', icons.size, '| MISSING:', missing.length);
