#!/usr/bin/env node
/**
 * publish-build.mjs
 *
 * Runs the two Vite build steps directly (no npm subprocess) so that every
 * byte of stderr passes through this process first.  The only lines suppressed
 * are the two known-harmless airo-sandbox WARN messages that the publish
 * pipeline incorrectly treats as build failures:
 *
 *   WARN airo-sandbox: user-specified path does not exist, skipping path=/git-repo …
 *   WARN airo-sandbox: user-specified path does not exist, skipping path=/node_modules …
 *
 * All TypeScript errors, Vite errors, dependency errors, and any other stderr
 * output is forwarded verbatim so real failures remain fully visible.
 *
 * Exit code mirrors the underlying build: non-zero on any failure, 0 on success.
 */

import { spawn } from 'node:child_process';

// Lines matching this pattern are the only ones suppressed.
// Plain string test — no regex — to avoid any ReDoS risk.
function isHarmlessSandboxWarn(line) {
  return (
    line.includes('WARN airo-sandbox: user-specified path does not exist') &&
    (line.includes('path=/git-repo') || line.includes('path=/node_modules'))
  );
}

/**
 * Run a command, filter its stderr, and resolve with the exit code.
 * stdout is always inherited (passed through untouched).
 */
function run(cmd, args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: ['inherit', 'inherit', 'pipe'],
      shell: false,
      env: { ...process.env, ...env },
    });

    let buf = '';

    child.stderr.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop(); // hold back any incomplete trailing line
      for (const line of lines) {
        if (!isHarmlessSandboxWarn(line)) {
          process.stderr.write(line + '\n');
        }
      }
    });

    child.stderr.on('end', () => {
      if (buf && !isHarmlessSandboxWarn(buf)) {
        process.stderr.write(buf + '\n');
      }
    });

    child.on('close', (code) => resolve(code ?? 1));
  });
}

// Resolve the vite binary path relative to this script so it works regardless
// of how the publish pipeline invokes us.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { cp, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
// existsSync removed — accessSync used instead (follows symlinks correctly)

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Resolve the vite binary robustly:
//   1. Try node_modules/.bin/vite (symlink — works in dev, may break in publish container)
//      Use accessSync to verify the target is actually readable (not a dangling symlink)
//   2. Fall back to node_modules/vite/bin/vite.js (direct path — always works)
import { accessSync, constants as fsConstants } from 'node:fs';
function resolveVite() {
  const symlink = join(root, 'node_modules', '.bin', 'vite');
  try {
    // accessSync follows symlinks — throws if the target doesn't exist or isn't executable
    accessSync(symlink, fsConstants.X_OK);
    return symlink;
  } catch { /* symlink missing or dangling — fall through */ }

  // Resolve via require so it follows the real package location
  try {
    const req = createRequire(pathToFileURL(join(root, 'package.json')));
    return req.resolve('vite/bin/vite.js');
  } catch {
    // Last resort — construct the path directly
    return join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  }
}

const vite = resolveVite();
console.log(`> using vite at: ${vite}`);

console.log('> build:app:client');
const clientCode = await run(
  process.execPath,          // node
  ['--max-old-space-size=1024', vite, 'build'],
  {},
);

if (clientCode !== 0) {
  console.error(`build:app:client failed with exit code ${clientCode}`);
  process.exit(clientCode);
}

console.log('> build:app:ssr');
// Clean dist/bin/ before the SSR build so stale hashed chunks from previous
// builds don't accumulate and inflate the deploy package.
try {
  await rm(join(root, 'dist', 'bin'), { recursive: true, force: true });
} catch { /* ignore if absent */ }
const ssrCode = await run(
  process.execPath,
  [
    '--max-old-space-size=3500',
    '--optimize-for-size',
    '--gc-interval=100',
    vite, 'build', '--ssr', 'src/server/entry.ts', '--emptyOutDir=false',
  ],
  {},
);

if (ssrCode !== 0) {
  console.error(`build:app:ssr failed with exit code ${ssrCode}`);
  process.exit(ssrCode);
}

// ── Copy seed JSON files into dist so the server can read them at runtime ──
// src/server/seed/starter-packs/default/*.json
//   → dist/server/seed/starter-packs/default/*.json
console.log('> copy:seed-data');
try {
  const seedSrc  = join(root, 'src',  'server', 'seed');
  const seedDest = join(root, 'dist', 'server', 'seed');
  await mkdir(seedDest, { recursive: true });
  await cp(seedSrc, seedDest, { recursive: true });
  console.log('  seed data copied to dist/server/seed/');
} catch (e) {
  // Non-fatal: if the directory doesn't exist the seeder will log a clear error at runtime.
  console.warn('  WARNING: could not copy seed data:', e.message);
}

process.exit(0);
