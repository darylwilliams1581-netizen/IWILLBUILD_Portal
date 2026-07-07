#!/usr/bin/env node
// Writes dist/.build-stamp using the same filesystem-walk hash as
// server.bundle.mjs and publish-build.mjs.
import { createHash } from 'node:crypto';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function hashDir(dir, h) {
  let entries;
  try { entries = readdirSync(dir).sort(); } catch { return; }
  for (const e of entries) {
    if (e === 'node_modules' || e === '.git' || e === 'dist') continue;
    const full = join(dir, e);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) hashDir(full, h);
    else { try { h.update(full + '\n'); h.update(readFileSync(full)); } catch {} }
  }
}

const h = createHash('sha256');
hashDir(join(root, 'src'), h);
for (const f of ['vite.config.ts', 'package.json', 'tsconfig.json', 'tsconfig.node.json']) {
  try { h.update(f + '\n'); h.update(readFileSync(join(root, f))); } catch {}
}
const hash = h.digest('hex').slice(0, 16);
writeFileSync(join(root, 'dist', '.build-stamp'), hash + '\n', 'utf8');
console.log('stamp written:', hash);
