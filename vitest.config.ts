import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],

  // ── Vitest 4: pool options are now top-level (poolOptions was removed) ────
  // Use forks pool to isolate memory per test file and prevent OOM on large
  // suites. Each test file runs in a fresh worker process.
  forks: {
    minForks: 1,
    maxForks: 4,
    isolate: true,
  },

  test: {
    // Only collect unit/component tests under src/ — Playwright e2e tests
    // live in tests/ and are run separately via `npm run test:e2e`.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'tests/**',             // Playwright e2e directory
      'test-results/**',      // Playwright output
      'playwright-report/**',
    ],
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    env: {
      // Provide a dummy secret so auth.ts does not throw during handler unit tests.
      // The real secret is never used in tests — auth is mocked at the po-auth layer.
      BETTER_AUTH_SECRET: 'test-secret-for-vitest-only-not-production',
    },
    pool: 'forks',
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

  // ── Define: make import.meta.env.PROD false in tests ─────────────────────
  // entry.ts wraps its entire startup IIFE (migrations + app.listen) in:
  //   if (import.meta.env.PROD) { ... }
  // Vitest's default mode is 'test', which sets PROD=true (any mode that is
  // not 'development' is considered production by Vite). That causes the IIFE
  // to run during tests, hitting the real DB and starting a real server on
  // port 3000 — both of which break unit tests.
  // Setting PROD=false here makes the block dead code so entry.ts can be
  // imported safely without side-effects.
  define: {
    'import.meta.env.PROD': false,
    'import.meta.env.DEV': false,
    'import.meta.env.SSR': false,
    'import.meta.env.MODE': JSON.stringify('test'),
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
      //
      // The regex uses [/\\] to match both POSIX (/) and Windows (\) path
      // separators so the alias fires on all platforms.
      //
      // This single regex catches every relative import of db/client.js
      // regardless of importer depth (../../db/client.js, ../db/client.js, etc.)
      // because Vite resolves the specifier to an absolute path before matching.
      {
        find: /[/\\]src[/\\]server[/\\]db[/\\]client(?:\.ts|\.js)?$/,
        replacement: path.resolve(__dirname, './src/test/stubs/db-client.stub.ts'),
      },
      // String alias for the @/server/db/client form used by auth.ts and others
      {
        find: '@/server/db/client',
        replacement: path.resolve(__dirname, './src/test/stubs/db-client.stub.ts'),
      },

      // ── po-auth stub ────────────────────────────────────────────────────────
      // Replaces the real po-auth module so handler unit tests can control
      // auth/permission outcomes via __setMockProfile() without a live DB.
      {
        find: /[/\\]src[/\\]server[/\\]lib[/\\]po-auth(?:\.ts|\.js)?$/,
        replacement: path.resolve(__dirname, './src/test/stubs/po-auth.stub.ts'),
      },

      // ── auth stub ───────────────────────────────────────────────────────────
      // Replaces the real BetterAuth instance so handler unit tests can control
      // session outcomes via __setMockSession() without a real auth server.
      {
        find: /[/\\]src[/\\]lib[/\\]auth[/\\]auth(?:\.ts|\.js)?$/,
        replacement: path.resolve(__dirname, './src/test/stubs/auth.stub.ts'),
      },

      // ── DB config stub ──────────────────────────────────────────────────────
      // Belt-and-braces: redirect direct imports of db/config so
      // getDatabaseCredentials() never reads /local/config.json.
      {
        find: /[/\\]src[/\\]server[/\\]db[/\\]config(?:\.ts|\.js)?$/,
        replacement: path.resolve(__dirname, './src/test/stubs/db-config.stub.ts'),
      },
      {
        find: '@/server/db/config',
        replacement: path.resolve(__dirname, './src/test/stubs/db-config.stub.ts'),
      },

      // ── virtual modules ─────────────────────────────────────────────────────
      {
        find: 'virtual:format-overrides',
        replacement: path.resolve(__dirname, './src/test/format-overrides-module.ts'),
      },
      // virtual:content — the real module is generated at Vite build time and
      // is not available in Vitest. Point at the permanent fallback file under
      // src/content/ (mirrors the stub but lives in the content tree so it is
      // also importable outside of tests if needed).
      {
        find: 'virtual:content',
        replacement: path.resolve(__dirname, './src/content/virtual-content-fallback.ts'),
      },

      // ── Named @/ aliases (must come before the catch-all) ──────────────────
      { find: '@/server/db/schema', replacement: path.resolve(__dirname, './src/server/db/schema.ts') },
      { find: '@/server',           replacement: path.resolve(__dirname, './src/server') },
      { find: '@/components',       replacement: path.resolve(__dirname, './src/components') },
      { find: '@/lib',              replacement: path.resolve(__dirname, './src/lib') },
      { find: '@/api',              replacement: path.resolve(__dirname, './src/server/api') },
      { find: '@/db',               replacement: path.resolve(__dirname, './src/server/db') },
      { find: '@/layouts',          replacement: path.resolve(__dirname, './src/layouts') },
      { find: '@/patterns',         replacement: path.resolve(__dirname, './src/patterns') },
      { find: '@/pages',            replacement: path.resolve(__dirname, './src/pages') },
      { find: '@/hooks',            replacement: path.resolve(__dirname, './src/hooks') },
      { find: '@/styles',           replacement: path.resolve(__dirname, './src/styles') },
      // @/ catch-all MUST come last — more-specific aliases above take priority
      { find: '@/',                 replacement: path.resolve(__dirname, './src/') },
    ],
  },
});
