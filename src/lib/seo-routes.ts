/**
 * Auto-synced registry of publicly-crawlable routes. Consumed by the
 * /sitemap.xml handler in src/server/entry.ts.
 *
 * DO NOT add or remove paths by hand. Static paths are mirrored here from
 * src/routes.tsx automatically whenever that file is edited (any manual
 * path edit would be overwritten on the next routes.tsx change). For sync
 * to pick up a route, its `path` must be a literal string starting with "/";
 * template literals and identifier refs are skipped, and dynamic-param routes
 * like "/products/:id" are excluded.
 *
 * The only fields safe to hand-edit are the per-entry metadata below, after a
 * sync:
 * - `priority` (0.0–1.0): Home = 1.0, main sections = 0.8, deep pages = 0.5.
 * - `changefreq` and `lastmod`.
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
  /** Set to false to exclude this route from the generated sitemap.xml. */
  sitemap?: boolean;
}

export const seoRoutes: SeoRoute[] = [
  // ── Public marketing pages — crawlable by search engines ──────────────────
  { path: "/",        changefreq: "weekly",  priority: 1.0, lastmod: "2026-09-03" },
  { path: "/signup",  changefreq: "monthly", priority: 0.9, lastmod: "2026-09-03" },

  // ── Legal / policy pages ──────────────────────────────────────────────────
  { path: "/terms",         changefreq: "yearly", priority: 0.4, lastmod: "2026-09-03" },
  { path: "/privacy",       changefreq: "yearly", priority: 0.4, lastmod: "2026-09-03" },
  { path: "/fair-use",      changefreq: "yearly", priority: 0.4, lastmod: "2026-09-03" },
  { path: "/system-policy", changefreq: "yearly", priority: 0.4, lastmod: "2026-09-03" },

  // ── Auth flow pages — low priority but indexable ──────────────────────────
  { path: "/login",           changefreq: "monthly", priority: 0.5 },
  { path: "/forgot-password", changefreq: "monthly", priority: 0.3 },
  { path: "/login-help",      changefreq: "monthly", priority: 0.3 },

  // NOTE: All authenticated app routes (/home, /dashboard, /jobs, /fleet, etc.)
  // are intentionally excluded — they are behind auth, blocked in robots.txt,
  // and must not appear in the public sitemap.
  //
  // NOTE: /download-app and /subscribe are intentionally excluded — these pages
  // are not yet publicly live and must not be indexed until launched.
];
