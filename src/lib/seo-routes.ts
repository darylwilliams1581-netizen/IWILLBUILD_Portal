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
  // ── Public marketing & landing pages ────────────────────────────────────────
  { path: "/",             changefreq: "weekly",  priority: 1.0, lastmod: "2026-08-06" },
  { path: "/download-app", changefreq: "monthly", priority: 0.8 },

  // ── Legal ────────────────────────────────────────────────────────────────────
  { path: "/privacy", changefreq: "yearly", priority: 0.4 },
  { path: "/terms",   changefreq: "yearly", priority: 0.4 },

  // ── Auth flows (public, no login required) ───────────────────────────────────
  { path: "/login",           changefreq: "monthly", priority: 0.6 },
  { path: "/signup",          changefreq: "monthly", priority: 0.9 },
  { path: "/forgot-password", changefreq: "monthly", priority: 0.3 },
  { path: "/reset-password",  changefreq: "monthly", priority: 0.3 },
  { path: "/login-help",      changefreq: "monthly", priority: 0.3 },
  { path: "/check-email",     changefreq: "monthly", priority: 0.2 },
  { path: "/verify-email",    changefreq: "monthly", priority: 0.2 },
  { path: "/verify-required", changefreq: "monthly", priority: 0.2 },

  // ── Customer portal (token-based, no staff login) ────────────────────────────
  { path: "/portal/login", changefreq: "monthly", priority: 0.4 },
];
