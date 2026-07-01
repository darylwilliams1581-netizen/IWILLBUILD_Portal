/**
 * Auto-synced registry of publicly-crawlable routes. Consumed by the
 * /sitemap.xml handler in src/server/entry.ts.
 *
 * IMPORTANT: Only include routes that are publicly accessible WITHOUT login.
 * Authenticated portal routes (dashboard, jobs, scheduler, fleet, etc.) must
 * NOT appear here — crawlers cannot access them and their presence in the
 * sitemap wastes crawl budget and can trigger soft-404 signals in GSC.
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
  /** Set to false to exclude from sitemap (e.g. auth-only routes) */
  sitemap?: boolean;
}

export const seoRoutes: SeoRoute[] = [
  // ── Public marketing / legal ──────────────────────────────────────────────
  { path: "/",              changefreq: "weekly",  priority: 1.0 },
  { path: "/privacy",       changefreq: "yearly",  priority: 0.4 },
  { path: "/terms",         changefreq: "yearly",  priority: 0.4 },

  // ── Auth flows (public, but low crawl value) ──────────────────────────────
  { path: "/login",         changefreq: "monthly", priority: 0.5 },
  { path: "/signup",        changefreq: "monthly", priority: 0.7 },
  { path: "/forgot-password", changefreq: "monthly", priority: 0.3 },

  // ── Authenticated portal routes — excluded from sitemap ───────────────────
  // Crawlers cannot access these; including them wastes crawl budget.
  { path: "/dashboard",     sitemap: false },
  { path: "/projects",      sitemap: false },
  { path: "/jobs",          sitemap: false },
  { path: "/scheduler",     sitemap: false },
  { path: "/fleet",         sitemap: false },
  { path: "/forms",         sitemap: false },
  { path: "/files",         sitemap: false },
  { path: "/estimating",    sitemap: false },
  { path: "/safety",        sitemap: false },
  { path: "/customers",     sitemap: false },
  { path: "/stakeholders",  sitemap: false },
  { path: "/invoices",      sitemap: false },
  { path: "/downloads",     sitemap: false },
  { path: "/dazza-ai",      sitemap: false },
  { path: "/annette",       sitemap: false },
  { path: "/team",          sitemap: false },
  { path: "/settings",      sitemap: false },
  { path: "/owner-console", sitemap: false },
  { path: "/billing",       sitemap: false },
  { path: "/subscription",  sitemap: false },
  { path: "/tools",         sitemap: false },
  { path: "/check-email",   sitemap: false },
  { path: "/verify-email",  sitemap: false },
  { path: "/verify-required", sitemap: false },
  { path: "/reset-password", sitemap: false },
];
