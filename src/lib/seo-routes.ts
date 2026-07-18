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
  { path: "/", changefreq: "weekly", priority: 1.0, lastmod: "2026-07-13" },
  { path: "/home", changefreq: "monthly", priority: 0.8 },
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
  { path: "/download-app", changefreq: "monthly", priority: 0.8 },
  { path: "/driver", changefreq: "monthly", priority: 0.8 },
  { path: "/prestart", changefreq: "monthly", priority: 0.8 },
  { path: "/portal/login", changefreq: "never", priority: 0.2 },
  { path: "/portal/dashboard", changefreq: "never", priority: 0.2 },
  { path: "/portal/payment-success", changefreq: "never", priority: 0.1 },
  { path: "/dashboard", changefreq: "monthly", priority: 0.8 },
  { path: "/projects", changefreq: "monthly", priority: 0.8 },
  { path: "/stakeholders", changefreq: "monthly", priority: 0.8 },
  { path: "/subscription", changefreq: "monthly", priority: 0.8 },
  { path: "/tools", changefreq: "monthly", priority: 0.8 },
  { path: "/jobs", changefreq: "monthly", priority: 0.8 },
  { path: "/scheduler", changefreq: "monthly", priority: 0.7 },
  { path: "/fleet", changefreq: "monthly", priority: 0.8 },
  { path: "/forms", changefreq: "monthly", priority: 0.8 },
  { path: "/files", changefreq: "monthly", priority: 0.7 },
  { path: "/estimating", changefreq: "monthly", priority: 0.8 },
  { path: "/builders-calc", changefreq: "monthly", priority: 0.8 },
  { path: "/takeoff-pad", changefreq: "monthly", priority: 0.8 },
  { path: "/safety", changefreq: "monthly", priority: 0.8 },
  { path: "/library", changefreq: "monthly", priority: 0.8 },
  { path: "/customers", changefreq: "monthly", priority: 0.8 },
  { path: "/invoices", changefreq: "monthly", priority: 0.8 },
  { path: "/studio", changefreq: "monthly", priority: 0.8 },
  { path: "/plan-manager", changefreq: "monthly", priority: 0.7 },
  { path: "/studio/asset-manager", changefreq: "monthly", priority: 0.6 },
  { path: "/signin-history", changefreq: "monthly", priority: 0.5 },
  { path: "/studio/jobs", changefreq: "monthly", priority: 0.5 },
  { path: "/studio/estimates", changefreq: "monthly", priority: 0.5 },
  { path: "/studio/fleet", changefreq: "monthly", priority: 0.5 },
  { path: "/studio/accounts", changefreq: "monthly", priority: 0.5 },
  { path: "/dazza-ai", changefreq: "monthly", priority: 0.6 },
  { path: "/annette", changefreq: "monthly", priority: 0.8 },
  { path: "/team", changefreq: "monthly", priority: 0.7 },
  { path: "/team/schedule", changefreq: "monthly", priority: 0.5 },
  { path: "/settings", changefreq: "monthly", priority: 0.6 },
  { path: "/owner-console", changefreq: "monthly", priority: 0.5 },
  { path: "/developer-console", changefreq: "monthly", priority: 0.8 },
  { path: "/roadmap", changefreq: "monthly", priority: 0.8 },
  { path: "/billing", changefreq: "monthly", priority: 0.6 },
];
