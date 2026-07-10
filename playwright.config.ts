import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for IWILLBUILD Portal.
 *
 * Web server: starts `npm run dev` (Vite) and waits up to 2 minutes for
 * http://localhost:3000 to respond before running tests.
 *
 * reuseExistingServer: true locally so you can keep `npm run dev` running
 * in a separate terminal and skip the startup wait on subsequent runs.
 * In CI (process.env.CI) a fresh server is always started.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 2,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },

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

  webServer: {
    // Vite dev server — port must match server.port in vite.config.ts.
    // The dev script uses PORT env var; default is 5173 but Playwright
    // tests expect 3000, so we pass PORT=3000 explicitly here.
    command: "cross-env PORT=3000 npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    // 2 minutes — Vite cold start on Windows with a large project can be slow.
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
