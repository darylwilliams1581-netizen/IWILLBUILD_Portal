#!/usr/bin/env node
/**
 * write-stamp.mjs
 * Computes the current source hash and writes it to dist/.build-stamp.
 * Used to mark pre-built dist artifacts as current after manual restoration.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function hashDir(dir, h) {
  let entries;
  try { entries = readdirSync(dir).sort(); } catch { return; }
  for (const e of entries) {
    if (e === 'node_modules' || e === '.git' || e === 'dist') continue;
    const full = join(dir, e);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      hashDir(full, h);
    } else {
      try { h.update(full + '\n'); h.update(readFileSync(full)); } catch { /* skip */ }
    }
  }
}

const h = createHash('sha256');
hashDir(join(root, 'src'), h);
for (const f of ['vite.config.ts', 'package.json', 'tsconfig.json', 'tsconfig.node.json']) {
  try { h.update(f + '\n'); h.update(readFileSync(join(root, f))); } catch { /* skip */ }
}
const hash = h.digest('hex').slice(0, 16);
const stampFile = join(root, 'dist', '.build-stamp');
writeFileSync(stampFile, hash + '\n', 'utf8');
console.log('Stamp written:', hash);
