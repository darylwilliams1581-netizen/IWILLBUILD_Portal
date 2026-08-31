import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for IWILLBUILD Portal.
 *
 * Separated from Vitest (unit/component tests in src/).
 * E2E tests live in tests/ and are run via `npm run test:e2e`.
 *
 * ⚠️  SANDBOX NOTE: Playwright requires spawning a browser process. The Airo
 * build sandbox blocks child-process execution, so `npm run test:e2e` will
 * always fail with EACCES inside the sandbox. Run e2e tests locally or in a
 * real CI environment (GitHub Actions, etc.) where the browser binary can
 * execute.
 *
 * Environment detection:
 *  - AIRO_PREVIEW_URL set  → use the running preview server (CI / sandbox)
 *  - Otherwise             → start Vite dev server on port 3000 (local dev)
 *
 * reuseExistingServer: true locally — keep `npm run dev` running in a
 * separate terminal to skip the cold-start wait on repeated runs.
 */

// The Airo sandbox exposes the running preview at this env var.
// When present we skip the webServer block and hit the proxy directly.
const previewUrl = process.env.AIRO_PREVIEW_URL;
const baseURL = previewUrl ?? "http://127.0.0.1:3000";

export default defineConfig({
  // ── Test discovery ────────────────────────────────────────────────────────
  testDir: "./tests",
  testMatch: ["**/*.spec.ts", "**/*.spec.tsx"],
  // Never pick up Vitest unit tests that live under src/
  testIgnore: ["**/src/**/__tests__/**", "**/src/**/*.test.*"],

  // ── Run behaviour ─────────────────────────────────────────────────────────
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 2,

  // ── Reporters ─────────────────────────────────────────────────────────────
  reporter: [["list"], ["html", { open: "never" }]],

  // ── Shared browser context ─────────────────────────────────────────────────
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },

  // ── Browser projects ──────────────────────────────────────────────────────
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"] },
    },
  ],

  // ── Dev server ────────────────────────────────────────────────────────────
  // Only start the dev server when no preview URL is available (local dev).
  // In the Airo sandbox / CI the server is already running — skip the spawn.
  ...(previewUrl
    ? {}
    : {
        webServer: {
          // npm.cmd is the Windows shim for npm; on Linux/macOS use npm directly.
          // The -- separator passes --host and --port directly to Vite.
          command:
            process.platform === "win32"
              ? "npm.cmd run dev -- --host 0.0.0.0 --port 3000"
              : "npm run dev -- --host 0.0.0.0 --port 3000",
          url: "http://127.0.0.1:3000",
          reuseExistingServer: !process.env.CI,
          // 2 minutes — Vite cold start on Windows with this project can be slow.
          timeout: 120_000,
          stdout: "pipe",
          stderr: "pipe",
          // Tell Vite to use DB stubs so the dev server never reads
          // /local/config.json during E2E runs. Both flags are checked in
          // vite.config.ts (isE2ERun) and trigger the db-stub aliases/plugin.
          env: {
            PW_E2E: "1",
            VITE_E2E: "1",
          },
        },
      }),
});
