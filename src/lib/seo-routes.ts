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
  { path: "/", changefreq: "weekly", priority: 1.0, lastmod: "2026-07-08" },
  { path: "/login", changefreq: "monthly", priority: 0.6 },
  { path: "/signup", changefreq: "monthly", priority: 0.8 },
  { path: "/privacy", changefreq: "yearly", priority: 0.3 },
  { path: "/terms", changefreq: "yearly", priority: 0.3 },
  { path: "/check-email", changefreq: "never", priority: 0.1 },
  { path: "/verify-email", changefreq: "never", priority: 0.1 },
  { path: "/verify-required", changefreq: "never", priority: 0.1 },
  { path: "/forgot-password", changefreq: "monthly", priority: 0.3 },
  { path: "/reset-password", changefreq: "monthly", priority: 0.3 },
  { path: "/login-help", changefreq: "monthly", priority: 0.3 },
  { path: "/portal/login", changefreq: "never", priority: 0.2 },
  { path: "/portal/dashboard", changefreq: "never", priority: 0.2 },
  { path: "/portal/payment-success", changefreq: "never", priority: 0.1 },
  { path: "/dashboard", changefreq: "monthly", priority: 0.8 },
  // /projects, /stakeholders, /subscription, /tools are redirect aliases — excluded from sitemap
  { path: "/jobs", changefreq: "monthly", priority: 0.8 },
  { path: "/scheduler", changefreq: "monthly", priority: 0.7 },
  { path: "/fleet", changefreq: "monthly", priority: 0.8 },
  { path: "/forms", changefreq: "monthly", priority: 0.8 },
  { path: "/files", changefreq: "monthly", priority: 0.7 },
  { path: "/estimating", changefreq: "monthly", priority: 0.8 },
  { path: "/safety", changefreq: "monthly", priority: 0.8 },
  { path: "/library", changefreq: "monthly", priority: 0.7 },
  { path: "/customers", changefreq: "monthly", priority: 0.8 },
  { path: "/invoices", changefreq: "monthly", priority: 0.8 },
  { path: "/studio", changefreq: "monthly", priority: 0.7 },
  { path: "/plan-manager", changefreq: "monthly", priority: 0.7 },
  { path: "/studio/asset-manager", changefreq: "monthly", priority: 0.6 },
  { path: "/signin-history", changefreq: "monthly", priority: 0.6 },
  // /studio/jobs, /studio/estimates, /studio/fleet, /studio/accounts are redirect aliases — excluded from sitemap
  { path: "/dazza-ai", changefreq: "monthly", priority: 0.6 },
  { path: "/annette", changefreq: "monthly", priority: 0.5 },
  { path: "/team", changefreq: "monthly", priority: 0.7 },
  { path: "/team/schedule", changefreq: "monthly", priority: 0.6 }, // maps to team-schedule.tsx
  { path: "/settings", changefreq: "monthly", priority: 0.6 },
  { path: "/owner-console", changefreq: "monthly", priority: 0.5 },
  // /developer-console is a redirect alias to /owner-console — excluded from sitemap
  { path: "/roadmap", changefreq: "monthly", priority: 0.4 },
  { path: "/billing", changefreq: "monthly", priority: 0.6 },
];
