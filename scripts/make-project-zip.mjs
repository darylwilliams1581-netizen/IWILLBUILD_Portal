/**
 * Creates a project ZIP containing all source files relevant to the
 * share security system and its dependencies.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const JSZip = require('/app/node_modules/jszip');

const zip = new JSZip();
const ROOT = '/app';

// Directories to include fully
const INCLUDE_DIRS = [
  'src/server/api/secure-share',
  'src/server/api/developer/test-share-security',
  'src/server/lib',
  'src/pages',
];

// Individual files to include
const INCLUDE_FILES = [
  'src/server/entry.ts',
];

function addDir(dirPath) {
  const abs = path.join(ROOT, dirPath);
  if (!fs.existsSync(abs)) return;
  const entries = fs.readdirSync(abs, { withFileTypes: true });
  for (const entry of entries) {
    const rel = path.join(dirPath, entry.name);
    const absEntry = path.join(ROOT, rel);
    if (entry.isDirectory()) {
      addDir(rel);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      zip.file('project/' + rel, fs.readFileSync(absEntry));
    }
  }
}

for (const dir of INCLUDE_DIRS) addDir(dir);
for (const file of INCLUDE_FILES) {
  const abs = path.join(ROOT, file);
  if (fs.existsSync(abs)) zip.file('project/' + file, fs.readFileSync(abs));
}

const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync('/shared-storage/public/assets/project-share-security-20260814.zip', buf);
console.log('PROJECT ZIP:', buf.length, 'bytes');
