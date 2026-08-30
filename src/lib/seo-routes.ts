/**
 * Auto-synced registry of publicly-crawlable routes. Consumed by the
 * /sitemap.xml handler in src/server/entry.ts.
 *
 * RULE: Only genuinely public, unauthenticated marketing and legal pages
 * belong here. Every authenticated portal route is blocked in robots.txt
 * and must NOT appear in the sitemap — search engines should never index
 * app-internal pages.
 *
 * Safe to hand-edit: priority, changefreq, lastmod.
 * Do NOT add authenticated routes here.
 *
 * EXCLUDED PAGES (do not add until conditions are met):
 *   /download-app — noindex,nofollow until APK_AVAILABLE is true and a signed
 *                   release is published. Re-add here AND remove the noindex
 *                   meta tag in pages/download-app.tsx at the same time.
 *   /subscribe    — noindex,nofollow; auth-gated subscription flow, not a
 *                   public landing page.
 */

export interface SeoRoute {
  path: string;
  changefreq?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority?: number;
  lastmod?: string;
  /** Set to false to exclude from sitemap output without deleting the entry */
  sitemap?: boolean;
}

export const seoRoutes: SeoRoute[] = [
  // ── Public marketing pages ────────────────────────────────────────────────
  { path: "/",        changefreq: "weekly", priority: 1.0, lastmod: "2026-08-31" },
  { path: "/privacy", changefreq: "yearly", priority: 0.4 },
  { path: "/terms",   changefreq: "yearly", priority: 0.4 },

  // ── Authenticated portal pages — excluded from sitemap ───────────────────
  // These pages are behind login; they must not appear in the public sitemap.
  // Listed here with sitemap:false so the scanner knows they are intentionally
  // excluded rather than missing.
  { path: "/lists",   sitemap: false },

  // ── Test files — not real routes ─────────────────────────────────────────
  // src/pages/__tests__/*.test files are picked up by the SEO scanner as
  // routes. They are test files, not pages. Excluded from sitemap entirely.
  { path: "/__tests__/finance.test",        sitemap: false },
  { path: "/__tests__/library.test",        sitemap: false },
  { path: "/__tests__/work-behaviour.test", sitemap: false },
];
