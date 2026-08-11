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
  { path: "/", changefreq: "weekly", priority: 1.0, lastmod: "2026-08-12" },
  // ── Public marketing / legal ──────────────────────────────────────────────
  { path: "/privacy", changefreq: "yearly", priority: 0.4 },
  { path: "/terms", changefreq: "yearly", priority: 0.4 },
  { path: "/download-app", changefreq: "monthly", priority: 0.8 },
  { path: "/subscribe", changefreq: "monthly", priority: 0.9 },
  // ── Auth pages — noindex in page Helmet; excluded from sitemap ────────────
  // /login, /signup, /check-email, /verify-email, /verify-required,
  // /forgot-password, /reset-password, /login-help  → noindex, not listed here
  // ── App portal (authenticated — crawlers won't reach these) ──────────────
  { path: "/home", changefreq: "monthly", priority: 0.8 },
  { path: "/driver", changefreq: "monthly", priority: 0.8 },
  { path: "/prestart", changefreq: "monthly", priority: 0.8 },
  // /site-escape → redirect to /home, not a real page
  { path: "/dashboard", changefreq: "monthly", priority: 0.8 },
  // /projects → redirect to /jobs
  // /stakeholders → redirect to /customers
  // /subscription → redirect to /billing
  // /tools → redirect to /estimating
  { path: "/jobs", changefreq: "monthly", priority: 0.8 },
  { path: "/incidents", changefreq: "monthly", priority: 0.8 },
  { path: "/risk-register", changefreq: "monthly", priority: 0.8 },
  { path: "/scheduler", changefreq: "monthly", priority: 0.8 },
  { path: "/fleet", changefreq: "monthly", priority: 0.8 },
  // /forms → redirect to /studio/forms
  { path: "/files", changefreq: "monthly", priority: 0.8 },
  { path: "/estimating", changefreq: "monthly", priority: 0.8 },
  { path: "/builders-calc", changefreq: "monthly", priority: 0.8 },
  { path: "/takeoff-pad", changefreq: "monthly", priority: 0.8 },
  { path: "/safety", changefreq: "monthly", priority: 0.8 },
  // /library → redirect to /studio/library
  { path: "/customers", changefreq: "monthly", priority: 0.8 },
  { path: "/invoices", changefreq: "monthly", priority: 0.8 },
  { path: "/studio", changefreq: "monthly", priority: 0.8 },
  { path: "/studio/documents", changefreq: "monthly", priority: 0.5 },
  { path: "/studio/forms", changefreq: "monthly", priority: 0.5 },
  { path: "/studio/global-lists", changefreq: "monthly", priority: 0.5 },
  { path: "/studio/library", changefreq: "monthly", priority: 0.5 },
  { path: "/safety/posters", changefreq: "monthly", priority: 0.5 },
  { path: "/job-docs", changefreq: "monthly", priority: 0.8 },
  { path: "/plan-manager", changefreq: "monthly", priority: 0.8 },
  { path: "/studio/asset-manager", changefreq: "monthly", priority: 0.5 },
  { path: "/signin-history", changefreq: "monthly", priority: 0.8 },
  // /studio/jobs → redirect to /jobs
  // /studio/estimates → redirect to /estimating
  // /studio/fleet → redirect to /fleet
  // /studio/accounts → redirect to /settings
  { path: "/dazza-ai", changefreq: "monthly", priority: 0.8 },
  // /annette → redirect to /owner-console?tab=health-check
  { path: "/team", changefreq: "monthly", priority: 0.8 },
  // /team/schedule → redirect to /scheduler?tab=team-shifts
  { path: "/quick-links", changefreq: "monthly", priority: 0.8 },
  { path: "/settings", changefreq: "monthly", priority: 0.8 },
  { path: "/profile", changefreq: "monthly", priority: 0.8 },
  { path: "/help", changefreq: "monthly", priority: 0.8 },
  { path: "/owner-console", changefreq: "monthly", priority: 0.8 },
  // /developer-console → redirect to /owner-console
  // /roadmap → redirect to /dashboard
  { path: "/billing", changefreq: "monthly", priority: 0.8 },
  { path: "/lists", changefreq: "monthly", priority: 0.8 },
  { path: "/user-logs", changefreq: "monthly", priority: 0.8 },
  { path: "/job-cards", changefreq: "monthly", priority: 0.8 },
  // /job-cards/new → transient form page, not a crawlable destination
  // ── Customer portal (token-gated, not crawlable) ──────────────────────────
  // /portal/login, /portal/dashboard, /portal/payment-success → excluded
];
