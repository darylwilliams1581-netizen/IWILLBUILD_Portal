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
  // ── Public marketing / landing pages ────────────────────────────────────────
  { path: "/", changefreq: "weekly", priority: 1.0, lastmod: "2026-07-31" },
  { path: "/download-app", changefreq: "monthly", priority: 0.8 },

  // ── Legal ────────────────────────────────────────────────────────────────────
  { path: "/privacy", changefreq: "yearly", priority: 0.4 },
  { path: "/terms", changefreq: "yearly", priority: 0.4 },

  // ── Auth flows (public, crawlable) ───────────────────────────────────────────
  { path: "/login", changefreq: "monthly", priority: 0.6 },
  { path: "/signup", changefreq: "monthly", priority: 0.9 },
  { path: "/forgot-password", changefreq: "monthly", priority: 0.3 },
  { path: "/reset-password", changefreq: "monthly", priority: 0.3 },
  { path: "/login-help", changefreq: "monthly", priority: 0.3 },

  // ── Public utility pages ─────────────────────────────────────────────────────
  // NOTE: All routes below are auth-protected app pages. They are intentionally
  // excluded from the public sitemap — crawlers cannot access them and including
  // them wastes crawl budget and produces "orphaned route" audit warnings.
  //
  // Removed (redirects — no page file, just loader redirects):
  //   /projects → /jobs
  //   /developer-console → /owner-console
  //   /site-escape → /home
  //
  // Removed (auth-protected app pages — not public content):
  //   /home, /dashboard, /jobs, /incidents, /risk-register, /scheduler,
  //   /fleet, /forms, /files, /estimating, /builders-calc, /takeoff-pad,
  //   /safety, /safety/posters, /library, /customers, /invoices, /studio,
  //   /studio/*, /job-docs, /plan-manager, /team, /team/schedule,
  //   /quick-links, /settings, /profile, /help, /camera, /owner-console,
  //   /roadmap, /billing, /lists, /user-logs, /job-cards, /job-cards/new,
  //   /signin-history, /dazza-ai, /annette, /stakeholders, /subscription,
  //   /tools, /driver, /prestart, /portal/*, /check-email, /verify-email,
  //   /verify-required
];
