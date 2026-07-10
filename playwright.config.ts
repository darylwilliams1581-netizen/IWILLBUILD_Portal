import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for IWILLBUILD Portal.
 *
 * Separated from Vitest (unit/component tests in src/).
 * E2E tests live in tests/ and are run via `npm run test:e2e`.
 *
 * webServer starts Vite on port 3000 and waits up to 2 minutes.
 * reuseExistingServer: true locally — keep `npm run dev` running in a
 * separate terminal to skip the cold-start wait on repeated runs.
 */
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
    baseURL: "http://127.0.0.1:3000",
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
  webServer: {
    // Use npm.cmd on Windows (npm.cmd is the Windows shim for npm).
    // The -- separator passes --host and --port directly to Vite.
    command: "npm.cmd run dev -- --host 0.0.0.0 --port 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    // 2 minutes — Vite cold start on Windows with this project can be slow.
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
