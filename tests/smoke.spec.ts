/**
 * tests/smoke.spec.ts — Playwright smoke test
 *
 * A minimal end-to-end smoke test that verifies the dev server starts and
 * the root page returns a 200 with a non-empty HTML body.
 *
 * Run with: npm run test:e2e
 *
 * The webServer block in playwright.config.ts starts `npm run dev` on
 * port 3000 before these tests execute.
 */
import { test, expect } from '@playwright/test';

test('homepage loads and returns 200', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
});

test('homepage has a non-empty body', async ({ page }) => {
  await page.goto('/');
  const body = await page.locator('body').innerHTML();
  expect(body.trim().length).toBeGreaterThan(0);
});

test('page title is set', async ({ page }) => {
  await page.goto('/');
  const title = await page.title();
  expect(title.length).toBeGreaterThan(0);
});
