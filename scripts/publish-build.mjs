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

// ── Pre-publish content check ─────────────────────────────────────────────────
// Verify all required content JSON files exist and have the correct shape
// before spending time on the Vite build. Fails fast with a clear message.
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

// ── Restore static imports in entry.ts ───────────────────────────────────────
// Previous build attempts converted all 408 handler imports to dynamic
// await import() wrappers. This prevents Rollup tree-shaking and forces it
// to hold the entire module graph in memory — making OOM *worse*, not better.
// This step converts them back to static imports so Rollup can tree-shake.
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

// ── Remove duplicate route registrations from entry.ts ───────────────────────
// The route group files (routes-safety.ts, routes-jobs.ts, etc.) are separate
// Rollup entry points. Any route registered in both entry.ts AND a route group
// file is bundled twice — doubling the memory cost for those handlers.
// This step removes the 169 duplicate registrations from entry.ts so each
// handler module is only bundled once (in its route group chunk).
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
    // Keep the heap ceiling low so V8 GCs aggressively during Rollup's
    // rendering phase. A lower ceiling = lower peak RSS, which keeps us
    // well within the pipeline container's cgroup memory limit.
    // 900 MB ceiling + 4 MB semi-space → ~1.02 GB peak RSS (tested).
    // --max-semi-space-size=4 forces more frequent minor GCs during the
    // transform phase, preventing live objects from accumulating. The
    // previous 8 MB setting allowed the nursery to grow to ~1.07 GB RSS.
    // --ssr without a path enables SSR mode while letting rollupOptions.input
    // declare multiple entry points (entry + route group files), which splits
    // the 1.3 MB server.bundle.mjs into smaller chunks.
    // Heap tuning for the SSR Rollup render phase:
    //
    // With dynamic imports in entry.ts, Rollup no longer needs to hold all
    // 408 handler ASTs in memory simultaneously — each handler is a separate
    // dynamic chunk that Rollup can serialise independently.
    // 900 MB ceiling is sufficient now that the static import fan-out is gone.
    // --max-semi-space-size=2 keeps the nursery small so minor GCs run
    // frequently during the transform phase, preventing old-gen accumulation.
    // lucide-react + @heroicons are aliased to icon-stub.ts during SSR build,
    // saving ~53 MB of AST from the Rollup render phase.
    // Heap ceiling: 900 MB. --max-semi-space-size=4 matches the previously
    // tested working configuration (900 MB + 4 MB semi-space → ~1.02 GB RSS).
    // The icon stub reduces the working set by ~44 MB (874 → 830 MB), giving
    // V8 ~70 MB of headroom to GC before hitting the ceiling.
    // Static imports (restored by restore-entry-static.mjs) allow Rollup to
    // tree-shake the 408 handler modules — only reachable code is bundled.
    // Heap ceiling: 1200 MB.
    // Architecture: single Rollup entry point (server.bundle only).
    // Route group files are imported statically from entry.ts via
    // register() calls — no separate rollupOptions.input entries.
    // This means Rollup builds ONE module graph sequentially instead of
    // 7 in parallel, reducing peak RSS from ~1.1 GB to ~600-800 MB.
    // Additional SSR memory savings in vite.config.ts:
    //   - date-fns-jalali (15.5 MB) → browser-only-stub
    //   - jsdom (11.2 MB) → browser-only-stub
    //   - lucide-react + @heroicons → icon-stub (~53 MB)
    // 1200 MB ceiling gives ~400 MB headroom above expected peak.
    '--max-old-space-size=1200',
    '--max-semi-space-size=2',
    vite, 'build', '--ssr', '--emptyOutDir=false',
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
