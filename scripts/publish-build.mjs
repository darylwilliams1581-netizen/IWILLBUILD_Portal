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
 * stdout is always inherited (passed through untouched to the pipeline).
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

    child.on('close', (code, signal) => {
      if (signal) {
        process.stderr.write(`[publish-build] process killed by signal: ${signal}\n`);
      }
      resolve(code ?? 1);
    });
  });
}

// Resolve the vite binary path relative to this script so it works regardless
// of how the publish pipeline invokes us.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { cp, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';

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

// ── Fast-path: skip build if dist artifacts are already current ───────────────
// The publish platform always runs `npm run build` even when pre-built artifacts
// are committed. We detect "already built" by hashing the source files that
// feed the build (src/, vite.config.ts, package.json, tsconfig*.json).
// Using a SOURCE hash (not git HEAD SHA) means the stamp survives the
// platform's auto-commit that wraps the dist artifacts — git HEAD changes
// every publish even when source is unchanged, but the source hash stays stable.
import { readFileSync as _readFileSync, writeFileSync as _writeFileSync, existsSync as _existsSync } from 'node:fs';
import { execSync as _execSync } from 'node:child_process';
import { createHash as _createHash } from 'node:crypto';

function getSourceHash() {
  try {
    // Hash the git tree of source files — fast, deterministic, order-stable.
    // `git ls-files` lists tracked files; we hash src/ + key config files.
    const files = _execSync(
      'git ls-files src/ vite.config.ts package.json tsconfig.json tsconfig.node.json 2>/dev/null',
      { cwd: root, encoding: 'utf8' }
    ).trim().split('\n').filter(Boolean).sort();

    const h = _createHash('sha256');
    for (const f of files) {
      try {
        h.update(f + '\n');
        h.update(_readFileSync(join(root, f)));
      } catch { /* skip unreadable files */ }
    }
    return h.digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

const stampFile = join(root, 'dist', '.build-stamp');
const bundleFile = join(root, 'dist', 'server.bundle.mjs');

function readStamp() {
  try { return _readFileSync(stampFile, 'utf8').trim(); } catch { return null; }
}

const sourceHash = getSourceHash();
const stampHash  = readStamp();

// Detect whether we are running inside the publish platform container.
// The platform extracts a tar.gz archive to /app — there is no .git directory.
// In the dev/preview environment, .git is always present.
// When running on the platform, we must NEVER skip the build — the platform
// overlays archives without cleaning, so stale dist/ files from previous deploys
// persist unless we overwrite them with a fresh build.
import { existsSync as _existsSync2 } from 'node:fs';
const isPublishPlatform = !_existsSync2(join(root, '.git'));
if (isPublishPlatform) {
  console.log('> running on publish platform (no .git) — fast-path disabled, forcing full build.');
}

if (
  !isPublishPlatform &&
  sourceHash &&
  stampHash === sourceHash &&
  _existsSync(bundleFile)
) {
  console.log(`> source hash ${sourceHash} matches stamp — dist artifacts are current, skipping build.`);
  process.exit(0);
}

console.log(`> source hash: ${sourceHash ?? 'unknown'}  stamp: ${stampHash ?? 'none'} — running full build.`);

// ── Pre-publish content check ─────────────────────────────────────────────────
console.log('> pre-publish-check');
const checkCode = await run(
  process.execPath,
  [join(root, 'scripts', 'pre-publish-check.mjs')],
  {},
);
if (checkCode !== 0) {
  console.error('pre-publish-check failed — fix content files before building.');
  process.exit(checkCode);
}

// ── Restore static imports in entry.ts (if needed) ───────────────────────────
// Converts any dynamic await import() wrappers back to static imports so
// Rollup can tree-shake properly. Skipped automatically if already clean.
console.log('> restore-entry-static');
const restoreCode = await run(
  process.execPath,
  [join(root, 'scripts', 'restore-entry-static.mjs')],
  {},
);
if (restoreCode !== 0) {
  console.error('restore-entry-static failed — aborting build.');
  process.exit(restoreCode);
}

// ── Dedup entry routes (no-op for single-entry build) ────────────────────────
console.log('> dedup-entry-routes');
const dedupCode = await run(
  process.execPath,
  [join(root, 'scripts', 'dedup-entry-routes.mjs')],
  {},
);
if (dedupCode !== 0) {
  console.error('dedup-entry-routes failed — aborting build.');
  process.exit(dedupCode);
}

// ── Lazify heavy handlers ─────────────────────────────────────────────────────
// Converts selected large handler imports to dynamic imports so they are
// split into separate chunks, reducing peak SSR build memory.
console.log('> lazify-handlers');
const lazifyCode = await run(
  process.execPath,
  [join(root, 'scripts', 'lazify-handlers.mjs')],
  {},
);
if (lazifyCode !== 0) {
  console.error('lazify-handlers failed — aborting build.');
  process.exit(lazifyCode);
}

// ── Client build ─────────────────────────────────────────────────────────────
console.log('> build:app:client');
const clientCode = await run(
  process.execPath,
  ['--max-old-space-size=896', vite, 'build'],
  {},
);
if (clientCode !== 0) {
  console.error(`build:app:client failed with exit code ${clientCode}`);
  process.exit(clientCode);
}

// ── SSR build ────────────────────────────────────────────────────────────────
console.log('> build:app:ssr');
// Clean dist/bin/ before the SSR build so stale hashed chunks from previous
// builds don't accumulate and inflate the deploy package.
try {
  await rm(join(root, 'dist', 'bin'), { recursive: true, force: true });
} catch { /* ignore if absent */ }

const ssrCode = await run(
  process.execPath,
  [
    // SSR build heap tuning — Rollup render phase.
    // noExternal:true forces Rollup to parse every npm dep into an AST.
    // We reduce the working set by aliasing large client-only packages to
    // browser-only-stub.ts during SSR build (vite.config.ts resolve.alias):
    //   - lucide-react + @heroicons → icon-stub        (~53 MB saved)
    //   - react-pdf + pdfjs-dist                       (~132 MB saved)
    //   - date-fns-jalali                               (~15.5 MB saved)
    //   - jsdom                                         (~11.2 MB saved)
    //   - @babel/*                                      (~11 MB saved)
    //   - drizzle-kit                                   (~9.8 MB saved)
    //   - es-abstract                                   (~10 MB saved)
    //   - @lexical/* + lexical                          (~8 MB saved)
    //   - @tanstack/react-query                         (~3 MB saved)
    //   - html-to-image, i18next, react-i18next,
    //     react-markdown, embla-carousel, vaul,
    //     cmdk, input-otp, react-day-picker             (~8 MB saved)
    // Total estimated savings: ~262 MB of AST.
    // Heap ceiling: 1600 MB — raised from 1400 MB after SIGKILL in publish pipeline.
    // --optimize-for-size: instructs V8 to prefer smaller memory footprint over speed.
    // --max-semi-space-size=1: minimise the young-generation heap (default 8 MB)
    //   so GC runs more frequently and keeps old-gen pressure lower.
    '--max-old-space-size=1600',
    '--max-semi-space-size=1',
    '--optimize-for-size',
    vite, 'build', '--ssr', '--emptyOutDir=false',
  ],
  {},
);

if (ssrCode !== 0) {
  console.error(`build:app:ssr failed with exit code ${ssrCode}`);
  // Restore static imports even on failure so source is not left modified
  await run(process.execPath, [join(root, 'scripts', 'restore-entry-static.mjs')], {});
  process.exit(ssrCode);
}

// ── Restore static imports after SSR build ────────────────────────────────────
// Reverses the lazify-handlers step so entry.ts and routes-safety.ts are
// restored to their original static-import form.
console.log('> restore-entry-static (post-SSR)');
await run(process.execPath, [join(root, 'scripts', 'restore-entry-static.mjs')], {});

// ── Write build stamp ─────────────────────────────────────────────────────────
// Records the source hash so the next publish run can skip the build if
// src/ and config files haven't changed.
if (sourceHash) {
  try {
    _writeFileSync(stampFile, sourceHash + '\n', 'utf8');
    console.log(`> build stamp written: ${sourceHash}`);
  } catch (e) {
    console.warn('  WARNING: could not write build stamp:', e.message);
  }
}

// ── Copy seed JSON files into dist ────────────────────────────────────────────
console.log('> copy:seed-data');
try {
  const seedSrc  = join(root, 'src',  'server', 'seed');
  const seedDest = join(root, 'dist', 'server', 'seed');
  await mkdir(seedDest, { recursive: true });
  await cp(seedSrc, seedDest, { recursive: true });
  console.log('  seed data copied to dist/server/seed/');
} catch (e) {
  console.warn('  WARNING: could not copy seed data:', e.message);
}

// ── Update EXPECTED_HASH in root server.bundle.mjs launcher ──────────────────
// Only runs if the root launcher exists (it may have been removed from git
// in favour of a npm start flow where the platform runs npm run build directly).
const launcherPath = join(root, 'server.bundle.mjs');
if (_existsSync(launcherPath)) {
  console.log('> updating EXPECTED_HASH in server.bundle.mjs');
  try {
    const { createHash: _createHashFile } = await import('node:crypto');
    const bundleBuf = _readFileSync(bundleFile);
    const newHash = _createHashFile('sha256').update(bundleBuf).digest('hex').slice(0, 16);
    let launcherSrc = _readFileSync(launcherPath, 'utf8');
    launcherSrc = launcherSrc.replace(
      /const EXPECTED_HASH = '[0-9a-f]+';/,
      `const EXPECTED_HASH = '${newHash}';`
    );
    _writeFileSync(launcherPath, launcherSrc, 'utf8');
    console.log(`  EXPECTED_HASH updated to: ${newHash}`);
  } catch (e) {
    console.warn('  WARNING: could not update EXPECTED_HASH:', e.message);
  }
}

// ── Stage SSR artifacts so the next git commit includes them ─────────────────
// Only runs in dev/CI environments where git is available.
// On the publish platform (no .git), this step is skipped silently.
console.log('> git add dist artifacts');
try {
  const { execFileSync } = await import('node:child_process');
  const filesToStage = [
    'dist/server.bundle.mjs',
    'dist/entry.mjs',
    'dist/bin/',
    'dist/server/',
    'dist/.build-stamp',
  ];
  // Only stage root launcher if it exists
  if (_existsSync(join(root, 'server.bundle.mjs'))) {
    filesToStage.unshift('server.bundle.mjs');
  }
  execFileSync('git', ['add', '-f', ...filesToStage], { cwd: root, stdio: 'inherit' });
  console.log('  dist artifacts staged.');
} catch (e) {
  // Non-fatal in CI environments where git may not be available
  console.warn('  WARNING: could not stage dist artifacts:', e.message);
}

process.exit(0);
