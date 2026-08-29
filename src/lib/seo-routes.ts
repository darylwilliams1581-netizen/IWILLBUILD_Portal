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
  { path: "/",             changefreq: "weekly",  priority: 1.0, lastmod: "2026-08-30" },
  { path: "/privacy",      changefreq: "yearly",  priority: 0.4 },
  { path: "/terms",        changefreq: "yearly",  priority: 0.4 },
  { path: "/download-app", changefreq: "monthly", priority: 0.6 },
  { path: "/subscribe",    changefreq: "monthly", priority: 0.6 },
];
