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
}

export const seoRoutes: SeoRoute[] = [
  { path: "/", changefreq: "weekly", priority: 1.0, lastmod: "2026-07-28" },
  { path: "/login", changefreq: "monthly", priority: 0.6 },
  { path: "/signup", changefreq: "monthly", priority: 0.9 },
  { path: "/privacy", changefreq: "yearly", priority: 0.4 },
  { path: "/terms", changefreq: "yearly", priority: 0.4 },
  { path: "/forgot-password", changefreq: "monthly", priority: 0.3 },
  { path: "/reset-password", changefreq: "monthly", priority: 0.3 },
  { path: "/login-help", changefreq: "monthly", priority: 0.3 },
  { path: "/download-app", changefreq: "monthly", priority: 0.8 },
  // ── Authenticated portal pages ─────────────────────────────────────────────
  // These are behind auth; priority kept low so crawlers don't waste budget.
  // noindex pages (builders-calc, safety/posters, job-docs, developer-console)
  // are intentionally excluded — they carry robots: noindex in their Helmet.
  // Redirect-only routes (/projects → /jobs, /stakeholders → /customers,
  // /developer-console → /owner-console) are also excluded.
  { path: "/home", changefreq: "monthly", priority: 0.5 },
  { path: "/dashboard", changefreq: "monthly", priority: 0.5 },
  { path: "/jobs", changefreq: "monthly", priority: 0.5 },
  { path: "/incidents", changefreq: "monthly", priority: 0.5 },
  { path: "/scheduler", changefreq: "monthly", priority: 0.5 },
  { path: "/fleet", changefreq: "monthly", priority: 0.5 },
  { path: "/files", changefreq: "monthly", priority: 0.5 },
  { path: "/estimating", changefreq: "monthly", priority: 0.5 },
  { path: "/safety", changefreq: "monthly", priority: 0.5 },
  { path: "/library", changefreq: "monthly", priority: 0.5 },
  { path: "/customers", changefreq: "monthly", priority: 0.5 },
  { path: "/invoices", changefreq: "monthly", priority: 0.5 },
  { path: "/plan-manager", changefreq: "monthly", priority: 0.5 },
  { path: "/quick-links", changefreq: "monthly", priority: 0.5 },
  { path: "/lists", changefreq: "monthly", priority: 0.5 },
  { path: "/job-cards", changefreq: "monthly", priority: 0.5 },
  { path: "/team", changefreq: "monthly", priority: 0.5 },
  { path: "/billing", changefreq: "monthly", priority: 0.5 },
  { path: "/help", changefreq: "monthly", priority: 0.5 },
  { path: "/roadmap", changefreq: "monthly", priority: 0.5 },
];
