#!/usr/bin/env node
/**
 * server.bundle.mjs  — BUILD TRIGGER (root launcher)
 *
 * The publish platform detects this file and runs it directly via fast-path.
 *
 * FAST-PATH LOGIC:
 *   If dist/server.bundle.mjs exists AND dist/.build-stamp matches the
 *   current source hash, skip the build and exec directly into the bundle.
 *   This works both in dev (git hash) and on the platform (filesystem hash).
 *
 * FULL BUILD PATH:
 *   If the stamp is missing or stale, run `npm run build` to produce fresh
 *   artifacts, then exec into dist/server.bundle.mjs.
 */

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)));
const distBundle = join(root, 'dist', 'server.bundle.mjs');
const stampFile  = join(root, 'dist', '.build-stamp');

// ── Source hash (filesystem-based, works with or without git) ────────────────
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

function getSourceHash() {
  try {
    const h = createHash('sha256');
    // Hash src/ tree + key config files
    hashDir(join(root, 'src'), h);
    for (const f of ['vite.config.ts', 'package.json', 'tsconfig.json', 'tsconfig.node.json']) {
      try { h.update(f + '\n'); h.update(readFileSync(join(root, f))); } catch { /* skip */ }
    }
    return h.digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

function readStamp() {
  try { return readFileSync(stampFile, 'utf8').trim(); } catch { return null; }
}

// ── Fast-path check ───────────────────────────────────────────────────────────
const sourceHash = getSourceHash();
const stampHash  = readStamp();

if (sourceHash && stampHash === sourceHash && existsSync(distBundle)) {
  console.log(`[launcher] Source hash ${sourceHash} matches stamp — skipping build, booting directly.`);
  bootServer();
} else {
  console.log(`[launcher] Source hash: ${sourceHash ?? 'unknown'}  stamp: ${stampHash ?? 'none'} — running full build.`);
  runBuild();
}

function runBuild() {
  // Ensure node_modules are present
  try {
    execFileSync(process.execPath, [join(root, 'node_modules', '.bin', 'vite'), '--version'], {
      cwd: root, stdio: 'ignore',
    });
  } catch {
    console.log('[launcher] node_modules missing — running npm install ...');
    execFileSync('npm', ['install', '--prefer-offline', '--no-audit', '--no-fund'], {
      cwd: root, stdio: 'inherit', shell: false,
    });
  }

  execFileSync('npm', ['run', 'build'], {
    cwd: root, stdio: 'inherit', shell: false,
  });

  if (!existsSync(distBundle)) {
    console.error('[launcher] ERROR: dist/server.bundle.mjs not found after build — aborting.');
    process.exit(1);
  }

  console.log('[launcher] Build complete — starting dist/server.bundle.mjs');
  bootServer();
}

function bootServer() {
  const child = spawn(process.execPath, [distBundle], {
    cwd: root, stdio: 'inherit', env: process.env, detached: false,
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}
