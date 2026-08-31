import { test, expect } from "@playwright/test";

/**
 * Home page smoke test.
 *
 * Verifies the app shell loads and the root route returns a 200 with a
 * non-empty <body>. This is intentionally minimal — it confirms Vite started,
 * the SSR render didn't crash, and the page is reachable before any
 * feature-specific tests run.
 */
test.describe("Home page", () => {
  test("loads with status 200", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
  });

  test("renders a non-empty body", async ({ page }) => {
    await page.goto("/");
    const body = await page.locator("body").innerHTML();
    expect(body.trim().length).toBeGreaterThan(0);
  });

  test("has a page title", async ({ page }) => {
    await page.goto("/");
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});
