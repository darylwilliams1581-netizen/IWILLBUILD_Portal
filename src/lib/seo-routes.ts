/**
 * Publicly-crawlable routes for the sitemap.
 *
 * RULE: Only genuine public marketing and legal pages belong here.
 * Authenticated portal pages, tools, admin consoles, test files, API routes,
 * auth flows, share/document routes and internal pages must NOT appear.
 *
 * The sitemap handler in src/server/entry.ts reads this file.
 * robots.txt is generated dynamically in entry.ts and must stay in sync.
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
  /** Set to false to exclude from sitemap XML while keeping the entry for reference */
  sitemap?: boolean;
}

export const seoRoutes: SeoRoute[] = [
  // ── Public marketing pages ────────────────────────────────────────────────
  { path: "/",            changefreq: "weekly",  priority: 1.0, lastmod: "2026-08-26" },
  { path: "/download-app",changefreq: "monthly", priority: 0.7, lastmod: "2026-08-26" },

  // ── Legal pages ───────────────────────────────────────────────────────────
  { path: "/privacy",     changefreq: "yearly",  priority: 0.4 },
  { path: "/terms",       changefreq: "yearly",  priority: 0.4 },
];
