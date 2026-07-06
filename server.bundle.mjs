#!/usr/bin/env node
/**
 * server.bundle.mjs  — BUILD TRIGGER (root launcher)
 *
 * The publish platform detects this file and runs it directly via fast-path.
 * This launcher always runs `npm run build` first to produce a fresh
 * dist/server.bundle.mjs, then execs into it.
 *
 * This ensures the platform NEVER boots stale pre-built artifacts — every
 * deploy gets a clean build from source, regardless of archive caching.
 *
 * Expected log sequence on platform:
 *   [INFO] Detected pre-built artifacts (server.bundle.mjs) - using fast path
 *   [launcher] Starting build — running npm run build ...
 *   > pre-publish-check
 *   > build:app:client
 *   > build:app:ssr
 *   [launcher] Build complete — starting dist/server.bundle.mjs
 */

import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)));
const distBundle = join(root, 'dist', 'server.bundle.mjs');

console.log('[launcher] Starting build — running npm run build ...');

try {
  execFileSync(process.execPath, [join(root, 'node_modules', '.bin', 'vite'), '--version'], {
    cwd: root,
    stdio: 'ignore',
  });
} catch {
  // node_modules not installed yet — run npm install first
  console.log('[launcher] node_modules missing — running npm install ...');
  execFileSync('npm', ['install', '--prefer-offline', '--no-audit', '--no-fund'], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });
}

// Run the full build pipeline
execFileSync('npm', ['run', 'build'], {
  cwd: root,
  stdio: 'inherit',
  shell: false,
});

if (!existsSync(distBundle)) {
  console.error('[launcher] ERROR: dist/server.bundle.mjs not found after build — aborting.');
  process.exit(1);
}

console.log('[launcher] Build complete — starting dist/server.bundle.mjs');

// Exec into the real server bundle (replaces this process)
const child = spawn(process.execPath, [distBundle], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
  detached: false,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
