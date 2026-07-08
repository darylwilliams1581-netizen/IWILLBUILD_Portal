import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function walk(dir, files = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    try {
      if (statSync(p).isDirectory()) walk(p, files);
      else if (p.endsWith('.tsx') || p.endsWith('.ts')) files.push(p);
    } catch {}
  }
  return files;
}

const used = new Set();
for (const f of walk('src')) {
  const src = readFileSync(f, 'utf8');
  const re = /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const names = m[1].matchAll(/\b([A-Z][a-zA-Z0-9]+)\b/g);
    for (const n of names) used.add(n[1]);
  }
}

const stub = readFileSync('src/fallbacks/icon-stub.ts', 'utf8');
const exported = new Set();
for (const m of stub.matchAll(/^export const ([A-Z][a-zA-Z0-9]+)/gm)) exported.add(m[1]);

const missing = [...used].filter(n => !exported.has(n)).sort();
console.log('MISSING:', missing.length ? missing.join(', ') : '(none)');
