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
  { path: "/home", changefreq: "monthly", priority: 0.5 },
  { path: "/login", changefreq: "monthly", priority: 0.6 },
  { path: "/signup", changefreq: "monthly", priority: 0.9 },
  { path: "/privacy", changefreq: "yearly", priority: 0.4 },
  { path: "/terms", changefreq: "yearly", priority: 0.4 },
  { path: "/check-email", changefreq: "monthly", priority: 0.8 },
  { path: "/verify-email", changefreq: "monthly", priority: 0.8 },
  { path: "/verify-required", changefreq: "monthly", priority: 0.8 },
  { path: "/forgot-password", changefreq: "monthly", priority: 0.3 },
  { path: "/reset-password", changefreq: "monthly", priority: 0.3 },
  { path: "/login-help", changefreq: "monthly", priority: 0.3 },
  { path: "/download-app", changefreq: "monthly", priority: 0.8 },
  { path: "/driver", changefreq: "monthly", priority: 0.8 },
  { path: "/prestart", changefreq: "monthly", priority: 0.8 },
  { path: "/site-escape", changefreq: "monthly", priority: 0.8 },
  { path: "/portal/login", changefreq: "monthly", priority: 0.5 },
  { path: "/portal/dashboard", changefreq: "monthly", priority: 0.5 },
  { path: "/portal/payment-success", changefreq: "monthly", priority: 0.5 },
  { path: "/dashboard", changefreq: "monthly", priority: 0.5 },
  { path: "/projects", changefreq: "monthly", priority: 0.8 },
  { path: "/stakeholders", changefreq: "monthly", priority: 0.8 },
  { path: "/subscription", changefreq: "monthly", priority: 0.8 },
  { path: "/tools", changefreq: "monthly", priority: 0.8 },
  { path: "/jobs", changefreq: "monthly", priority: 0.5 },
  { path: "/incidents", changefreq: "monthly", priority: 0.5 },
  { path: "/risk-register", changefreq: "monthly", priority: 0.8 },
  { path: "/scheduler", changefreq: "monthly", priority: 0.5 },
  { path: "/fleet", changefreq: "monthly", priority: 0.5 },
  { path: "/forms", changefreq: "monthly", priority: 0.8 },
  { path: "/files", changefreq: "monthly", priority: 0.5 },
  { path: "/estimating", changefreq: "monthly", priority: 0.5 },
  { path: "/builders-calc", changefreq: "monthly", priority: 0.8 },
  { path: "/takeoff-pad", changefreq: "monthly", priority: 0.8 },
  { path: "/safety", changefreq: "monthly", priority: 0.5 },
  { path: "/library", changefreq: "monthly", priority: 0.5 },
  { path: "/customers", changefreq: "monthly", priority: 0.5 },
  { path: "/invoices", changefreq: "monthly", priority: 0.5 },
  { path: "/studio", changefreq: "monthly", priority: 0.8 },
  { path: "/studio/documents", changefreq: "monthly", priority: 0.5 },
  { path: "/studio/forms", changefreq: "monthly", priority: 0.5 },
  { path: "/studio/library", changefreq: "monthly", priority: 0.5 },
  { path: "/safety/posters", changefreq: "monthly", priority: 0.5 },
  { path: "/job-docs", changefreq: "monthly", priority: 0.8 },
  { path: "/plan-manager", changefreq: "monthly", priority: 0.5 },
  { path: "/studio/asset-manager", changefreq: "monthly", priority: 0.5 },
  { path: "/signin-history", changefreq: "monthly", priority: 0.8 },
  { path: "/studio/jobs", changefreq: "monthly", priority: 0.5 },
  { path: "/studio/estimates", changefreq: "monthly", priority: 0.5 },
  { path: "/studio/fleet", changefreq: "monthly", priority: 0.5 },
  { path: "/studio/accounts", changefreq: "monthly", priority: 0.5 },
  { path: "/dazza-ai", changefreq: "monthly", priority: 0.8 },
  { path: "/annette", changefreq: "monthly", priority: 0.8 },
  { path: "/team", changefreq: "monthly", priority: 0.5 },
  { path: "/team/schedule", changefreq: "monthly", priority: 0.5 },
  { path: "/quick-links", changefreq: "monthly", priority: 0.5 },
  { path: "/settings", changefreq: "monthly", priority: 0.8 },
  { path: "/profile", changefreq: "monthly", priority: 0.8 },
  { path: "/help", changefreq: "monthly", priority: 0.5 },
  { path: "/camera", changefreq: "monthly", priority: 0.8 },
  { path: "/owner-console", changefreq: "monthly", priority: 0.8 },
  { path: "/developer-console", changefreq: "monthly", priority: 0.8 },
  { path: "/roadmap", changefreq: "monthly", priority: 0.5 },
  { path: "/billing", changefreq: "monthly", priority: 0.5 },
  { path: "/lists", changefreq: "monthly", priority: 0.5 },
  { path: "/user-logs", changefreq: "monthly", priority: 0.8 },
  { path: "/job-cards", changefreq: "monthly", priority: 0.5 },
];
