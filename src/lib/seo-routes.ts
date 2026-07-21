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
  // ── Public marketing pages ──────────────────────────────────────────────────
  { path: "/",          changefreq: "weekly",  priority: 1.0, lastmod: "2026-07-21" },
  { path: "/signup",    changefreq: "monthly", priority: 0.9 },
  { path: "/login",     changefreq: "monthly", priority: 0.6 },
  { path: "/privacy",   changefreq: "yearly",  priority: 0.4 },
  { path: "/terms",     changefreq: "yearly",  priority: 0.4 },
  { path: "/roadmap",   changefreq: "weekly",  priority: 0.5 },
  { path: "/download-app", changefreq: "monthly", priority: 0.8 },

  // ── Auth flow pages (low priority — not crawlable content) ──────────────────
  { path: "/forgot-password",  changefreq: "monthly", priority: 0.3 },
  { path: "/reset-password",   changefreq: "monthly", priority: 0.3 },
  { path: "/login-help",       changefreq: "monthly", priority: 0.3 },
  { path: "/check-email",      changefreq: "never",   priority: 0.1 },
  { path: "/verify-email",     changefreq: "never",   priority: 0.1 },
  { path: "/verify-required",  changefreq: "never",   priority: 0.1 },

  // ── Customer portal (separate auth context) ─────────────────────────────────
  { path: "/portal/login",           changefreq: "never", priority: 0.2 },
  { path: "/portal/dashboard",       changefreq: "never", priority: 0.2 },
  { path: "/portal/payment-success", changefreq: "never", priority: 0.1 },

  // ── Authenticated app — main sections ───────────────────────────────────────
  { path: "/home",        changefreq: "monthly", priority: 0.8 },
  { path: "/dashboard",   changefreq: "monthly", priority: 0.8 },
  { path: "/jobs",        changefreq: "monthly", priority: 0.8 },
  { path: "/scheduler",   changefreq: "monthly", priority: 0.7 },
  { path: "/fleet",       changefreq: "monthly", priority: 0.8 },
  { path: "/forms",       changefreq: "monthly", priority: 0.8 },
  { path: "/files",       changefreq: "monthly", priority: 0.7 },
  { path: "/estimating",  changefreq: "monthly", priority: 0.8 },
  { path: "/safety",      changefreq: "monthly", priority: 0.8 },
  { path: "/customers",   changefreq: "monthly", priority: 0.8 },
  { path: "/invoices",    changefreq: "monthly", priority: 0.8 },
  { path: "/studio",      changefreq: "monthly", priority: 0.8 },
  { path: "/team",        changefreq: "monthly", priority: 0.7 },
  { path: "/settings",    changefreq: "monthly", priority: 0.6 },
  { path: "/profile",     changefreq: "monthly", priority: 0.8 },
  { path: "/billing",     changefreq: "monthly", priority: 0.6 },
  { path: "/dazza-ai",    changefreq: "monthly", priority: 0.6 },

  // ── Authenticated app — sub-sections ────────────────────────────────────────
  { path: "/builders-calc",          changefreq: "monthly", priority: 0.7 },
  { path: "/takeoff-pad",            changefreq: "monthly", priority: 0.7 },
  { path: "/plan-manager",           changefreq: "monthly", priority: 0.7 },
  { path: "/asset-manager",          changefreq: "monthly", priority: 0.6 },
  { path: "/team/schedule",          changefreq: "monthly", priority: 0.5 },
  { path: "/signin-history",         changefreq: "monthly", priority: 0.5 },
  { path: "/owner-console",          changefreq: "monthly", priority: 0.5 },
  { path: "/studio/documents",       changefreq: "monthly", priority: 0.5 },
  { path: "/studio/forms",           changefreq: "monthly", priority: 0.5 },
  { path: "/studio/library",         changefreq: "monthly", priority: 0.5 },
  { path: "/studio/jobs",            changefreq: "monthly", priority: 0.5 },
  { path: "/studio/estimates",       changefreq: "monthly", priority: 0.5 },
  { path: "/studio/fleet",           changefreq: "monthly", priority: 0.5 },
  { path: "/studio/accounts",        changefreq: "monthly", priority: 0.5 },
  { path: "/studio/asset-manager",   changefreq: "monthly", priority: 0.5 },
  { path: "/safety/posters",         changefreq: "monthly", priority: 0.5 },
  { path: "/job-field-docs",         changefreq: "monthly", priority: 0.6 },

  // ── Redirect aliases (kept for sitemap continuity) ───────────────────────────
  { path: "/projects",     changefreq: "never", priority: 0.1 },
  { path: "/stakeholders", changefreq: "never", priority: 0.1 },
  { path: "/subscription", changefreq: "never", priority: 0.1 },
  { path: "/tools",        changefreq: "never", priority: 0.1 },
  { path: "/library",      changefreq: "never", priority: 0.1 },

  // ── Field worker / mobile pages ─────────────────────────────────────────────
  { path: "/driver",   changefreq: "monthly", priority: 0.7 },
  { path: "/prestart", changefreq: "monthly", priority: 0.7 },
];
