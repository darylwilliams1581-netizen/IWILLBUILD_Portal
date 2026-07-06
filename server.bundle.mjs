// Root-level launcher required by the publish platform's fast-path deploy.
// The platform detects "pre-built artifacts" by looking for server.bundle.mjs
// at the app root (/app/server.bundle.mjs) and starts it with:
//   node ./server.bundle.mjs
//
// IMPORTANT: The platform overlays new archives on /app WITHOUT cleaning first.
// Stale dist/server.bundle.mjs and dist/bin/ chunks from previous deploys can
// persist and shadow the correct files. To guarantee we always run the correct
// bundle, we run `npm run build` here before importing dist/server.bundle.mjs.
// Our build script fast-paths in ~300ms when source is unchanged (stamp match),
// so this adds negligible startup time while ensuring dist/ is always fresh.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Run npm run build to ensure dist/server.bundle.mjs and dist/bin/ are current.
// stdio: inherit so build output is visible in platform logs.
try {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npm, ['run', 'build'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });
} catch (e) {
  console.error('[launcher] npm run build failed:', e.message);
  process.exit(1);
}

// Now import the freshly-built bundle. Use a dynamic import so Node resolves
// the file AFTER the build has written it (static imports are hoisted and
// would resolve before the build runs).
const bundlePath = join(__dirname, 'dist', 'server.bundle.mjs');
await import(bundlePath);
