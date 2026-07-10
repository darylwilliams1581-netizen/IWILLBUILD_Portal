import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // Only collect unit/component tests under src/ — Playwright e2e tests
    // live in tests/ and are run separately via `npm run test:e2e`.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'tests/**',            // Playwright e2e directory
      'test-results/**',     // Playwright output
      'playwright-report/**',
    ],
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // Use forks pool to isolate memory per test file (prevents OOM)
    pool: 'forks',
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 4, // Limit parallelism to prevent memory exhaustion
        isolate: true, // Each test file runs in fresh process
      },
    },
    // Limit concurrent tests within each file
    maxConcurrency: 5,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        'tests/',
        '*.config.js',
        '*.config.ts',
      ],
    },
  },
  resolve: {
    alias: [
      // ── #airo/secrets ───────────────────────────────────────────────────────
      // package.json `imports` subpath maps this to airo-secrets/src/index.ts
      // in Node/production. Vitest does not honour package.json `imports` by
      // default, so we alias it explicitly to a test-safe fallback that reads
      // from process.env instead of /local/config.json.
      {
        find: '#airo/secrets',
        replacement: path.resolve(__dirname, './src/fallbacks/airo-secrets.ts'),
      },

      // ── DB client stub ──────────────────────────────────────────────────────
      // src/server/db/client.ts calls getDatabaseCredentials() at module-load
      // time, which throws when /local/config.json is absent (test/local env).
      // Aliasing the resolved file path redirects every relative import of
      // db/client.js (100+ API handlers) AND the @/server/db/client alias to
      // the same no-op stub — no vi.mock() calls needed in individual tests.
      //
      // Regex matches any path ending in /src/server/db/client(.js|.ts)?
      // so depth-varying relative imports (../../db/client.js, ../db/client.js)
      // are all caught by the same rule.
      {
        find: /\/src\/server\/db\/client(\.js|\.ts)?$/,
        replacement: path.resolve(__dirname, './src/test/stubs/db-client.stub.ts'),
      },
      {
        find: '@/server/db/client',
        replacement: path.resolve(__dirname, './src/test/stubs/db-client.stub.ts'),
      },

      // ── DB config stub ──────────────────────────────────────────────────────
      // Belt-and-braces: if anything imports config directly, return safe
      // dummy credentials instead of reading /local/config.json.
      {
        find: /\/src\/server\/db\/config(\.js|\.ts)?$/,
        replacement: path.resolve(__dirname, './src/test/stubs/db-config.stub.ts'),
      },
      {
        find: '@/server/db/config',
        replacement: path.resolve(__dirname, './src/test/stubs/db-config.stub.ts'),
      },

      // ── Standard aliases ────────────────────────────────────────────────────
      {
        find: 'virtual:format-overrides',
        replacement: path.resolve(__dirname, './src/test/format-overrides-module.ts'),
      },
      { find: '@/components', replacement: path.resolve(__dirname, './src/components') },
      { find: '@/lib',        replacement: path.resolve(__dirname, './src/lib') },
      { find: '@/api',        replacement: path.resolve(__dirname, './src/server/api') },
      { find: '@/db',         replacement: path.resolve(__dirname, './src/server/db') },
      { find: '@/layouts',    replacement: path.resolve(__dirname, './src/layouts') },
      { find: '@/patterns',   replacement: path.resolve(__dirname, './src/patterns') },
      { find: '@/pages',      replacement: path.resolve(__dirname, './src/pages') },
      { find: '@/hooks',      replacement: path.resolve(__dirname, './src/hooks') },
      { find: '@/styles',     replacement: path.resolve(__dirname, './src/styles') },
      // @/ catch-all must come LAST — more-specific aliases above take priority
      { find: '@/',           replacement: path.resolve(__dirname, './src/') },
    ],
  },
});
