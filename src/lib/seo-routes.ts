/**
 * Publicly-crawlable routes for the sitemap.
 *
 * RULE: Only genuine public marketing and legal pages belong here.
 * Authenticated portal pages, tools, admin consoles, test files, API routes,
 * auth flows, share/document routes and internal pages must NOT appear.
 *
 * The sitemap handler in src/server/entry.ts reads this file.
 * robots.txt is generated dynamically in entry.ts and must stay in sync.
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
  /** Set to false to exclude from sitemap XML while keeping the entry for reference */
  sitemap?: boolean;
}

export const seoRoutes: SeoRoute[] = [
  // ── Public marketing pages ────────────────────────────────────────────────
  { path: "/",            changefreq: "weekly",  priority: 1.0, lastmod: "2026-08-26" },

  // /download-app: noindex + excluded from sitemap until first signed APK release.
  // To activate: set sitemap:true (or remove this entry), remove noindex from the
  // page's <Helmet>, set APK_AVAILABLE=true in download-app.tsx, update lastmod.
  { path: "/download-app", sitemap: false },

  // ── Legal pages ───────────────────────────────────────────────────────────
  { path: "/privacy",     changefreq: "yearly",  priority: 0.4 },
  { path: "/terms",       changefreq: "yearly",  priority: 0.4 },

  // ── Authenticated portal pages — excluded from sitemap, noindex ───────────
  // These are registered here so the SEO scanner knows they are intentionally
  // excluded. They must NOT appear in the sitemap XML (sitemap: false).
  { path: "/lists",       sitemap: false },

  // ── Test files — not route pages, excluded from sitemap and indexing ──────
  // src/pages/__tests__/*.test.tsx files are picked up by the page scanner.
  // Registering them here with sitemap:false suppresses the "not registered"
  // audit warning. These paths are never served as real routes.
  { path: "/__tests__/finance.test",        sitemap: false },
  { path: "/__tests__/library.test",        sitemap: false },
  { path: "/__tests__/safety-posters.test", sitemap: false },
  { path: "/__tests__/work-behaviour.test", sitemap: false },
];
