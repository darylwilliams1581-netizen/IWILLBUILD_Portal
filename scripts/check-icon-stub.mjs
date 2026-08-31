import fs from 'fs';
import path from 'path';

function walk(dir) {
  const files = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) files.push(...walk(full));
    else if (f.endsWith('.tsx') || f.endsWith('.ts')) files.push(full);
  }
  return files;
}

const used = new Set();
for (const file of walk('src')) {
  const content = fs.readFileSync(file, 'utf8');
  const re = /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    for (const name of m[1].split(',')) {
      const clean = name.trim().split(/\s+as\s+/)[0].trim();
      if (clean) used.add(clean);
    }
  }
}

const stubContent = fs.readFileSync('src/fallbacks/icon-stub.ts', 'utf8');
const stubExports = new Set([...stubContent.matchAll(/^export const (\w+)/gm)].map(m => m[1]));

const missing = [...used].filter(n => !stubExports.has(n)).sort();
if (missing.length) {
  console.log('MISSING from icon-stub:');
  console.log(missing.join('\n'));
} else {
  console.log('All icons present in stub.');
}
