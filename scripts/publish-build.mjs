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

// ── Lazify heavy handlers before SSR build ────────────────────────────────────
// Converts the ~40 heaviest handler imports (dazza/chat 84KB, 28 migrate ops,
// seed endpoints, AI streaming, PDF generation, ledger sync) from static
// top-level imports to dynamic await import() wrappers. This removes ~200KB
// of handler AST from Rollup's static module graph during the SSR build,
// reducing peak RSS by ~80–120 MB.
//
// IMPORTANT: This is SELECTIVE lazification — only the heaviest non-hot-path
// handlers. Full lazification (all 400+ handlers) makes OOM worse because
// Rollup must resolve all dynamic imports simultaneously during rendering.
// Selective lazification keeps the static graph small while avoiding that trap.
//
// The restore-entry-static step below reverses this after the SSR build so
// the source files are not left in a modified state.
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

console.log('> build:app:client');
const clientCode = await run(
  process.execPath,          // node
  ['--max-old-space-size=896', vite, 'build'],
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
// restored to their original static-import form. This keeps the source tree
// clean and ensures dev-server restarts work normally.
console.log('> restore-entry-static (post-SSR)');
await run(process.execPath, [join(root, 'scripts', 'restore-entry-static.mjs')], {});

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
