/**
 * Launch-cleanup regression tests.
 *
 * Proves the four invariants required before going live:
 *   1. comingSoon entries are absent from navigation (PortalSidebar) and Help
 *   2. /download-app is absent from seo-routes (sitemap)
 *   3. Authenticated portal routes are excluded from seo-routes
 *   4. Unfinished (comingSoon) hrefs have no route registration → standard 404
 *
 * These tests read source files directly so they catch regressions at CI time
 * without needing a running server.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const src = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');

const homeIconsSrc  = src('src/lib/homeIcons.ts');
const sidebarSrc    = src('src/components/PortalSidebar.tsx');
const helpSrc       = src('src/pages/help.tsx');
const routesSrc     = src('src/routes.tsx');
const seoRoutesSrc  = src('src/lib/seo-routes.ts');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract all comingSoon hrefs from homeIcons.ts */
function comingSoonHrefs(): string[] {
  const lines = homeIconsSrc.split('\n');
  const hrefs: string[] = [];
  for (const line of lines) {
    if (!line.includes('comingSoon: true')) continue;
    const m = line.match(/href:\s*'([^']+)'/);
    if (m) hrefs.push(m[1]);
  }
  return hrefs;
}

/** Extract all live (non-comingSoon) hrefs from homeIcons.ts */
function liveHrefs(): Set<string> {
  const lines = homeIconsSrc.split('\n');
  const hrefs = new Set<string>();
  for (const line of lines) {
    if (line.includes('comingSoon: true')) continue;
    const m = line.match(/href:\s*'([^']+)'/);
    if (m) hrefs.add(m[1]);
  }
  return hrefs;
}
  const lines = homeIconsSrc.split('\n');
  const keys: string[] = [];
  for (const line of lines) {
    if (!line.includes('comingSoon: true')) continue;
    const m = line.match(/key:\s*'([^']+)'/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

// ── 1. comingSoon entries absent from navigation ──────────────────────────────

describe('comingSoon entries absent from PortalSidebar navigation', () => {
  // Only test hrefs that are exclusively comingSoon (not shared with a live icon)
  const live = liveHrefs();
  const hrefs = comingSoonHrefs().filter(h => !live.has(h));

  it('has at least one exclusively-comingSoon href to test against', () => {
    expect(hrefs.length).toBeGreaterThan(0);
  });

  for (const href of hrefs) {
    it(`sidebar does not link to ${href}`, () => {
      // The sidebar must not contain a hard-coded href to any exclusively-comingSoon route
      expect(sidebarSrc).not.toContain(`'${href}'`);
      expect(sidebarSrc).not.toContain(`"${href}"`);
    });
  }
});

// ── 2. comingSoon entries absent from Help page ───────────────────────────────

describe('comingSoon entries absent from Help page', () => {
  it('Help imports VISIBLE_GROUP_CONFIG (not a hardcoded group list)', () => {
    expect(helpSrc).toContain('VISIBLE_GROUP_CONFIG');
    expect(helpSrc).not.toContain('COMING_SOON_ICON_DEFS');
  });

  it('Help does not import FIELD_ICON_DEFS directly (uses VISIBLE_GROUP_CONFIG)', () => {
    // If Help imports individual group arrays it could accidentally include comingSoon
    expect(helpSrc).not.toContain('FIELD_ICON_DEFS');
    expect(helpSrc).not.toContain('FILES_ICON_DEFS');
    expect(helpSrc).not.toContain('FLEET_ICON_DEFS');
    expect(helpSrc).not.toContain('FINANCE_ICON_DEFS');
    expect(helpSrc).not.toContain('SAFETY_ICON_DEFS');
    expect(helpSrc).not.toContain('MANAGEMENT_ICON_DEFS');
  });

  const keys = comingSoonKeys();
  for (const key of keys) {
    it(`Help ICON_DOCS does not document comingSoon key '${key}'`, () => {
      // comingSoon keys must not appear as ICON_DOCS entries in help.tsx
      // (they should not be documented because they are not shown)
      expect(helpSrc).not.toContain(`  ${key}:`);
    });
  }

  it('VISIBLE_GROUP_CONFIG in homeIcons.ts filters out comingSoon entries', () => {
    expect(homeIconsSrc).toContain('VISIBLE_GROUP_CONFIG');
    expect(homeIconsSrc).toContain('!i.comingSoon');
    // comingSoon group is intentionally excluded from VISIBLE_GROUP_CONFIG
    expect(homeIconsSrc).toContain('comingSoon group intentionally excluded');
  });
});

// ── 3. /download-app absent from sitemap ─────────────────────────────────────

describe('seo-routes.ts — sitemap exclusions', () => {
  /** Extract path values only (not comments) */
  function seoPathValues(): string[] {
    return [...seoRoutesSrc.matchAll(/path:\s*["']([^"']+)["']/g)].map(m => m[1]);
  }

  it('/download-app is NOT a path value in seo-routes', () => {
    expect(seoPathValues()).not.toContain('/download-app');
  });

  it('/subscribe is NOT a path value in seo-routes', () => {
    expect(seoPathValues()).not.toContain('/subscribe');
  });

  it('/annette is NOT a path value in seo-routes', () => {
    expect(seoPathValues()).not.toContain('/annette');
  });

  it('only the three expected public paths are present', () => {
    expect(seoPathValues()).toEqual(['/', '/privacy', '/terms']);
  });
});

// ── 4. Authenticated routes excluded from sitemap ────────────────────────────

describe('seo-routes.ts — no authenticated routes', () => {
  const authRoutes = [
    '/home', '/dashboard', '/jobs', '/work', '/job-cards', '/scheduler',
    '/lens', '/plan-manager', '/files', '/fleet',
    '/finance', '/invoices', '/estimating', '/builders-calc', '/takeoff-pad',
    '/safety', '/incidents', '/risk-register', '/sds-register', '/rl-register',
    '/electrical-tests', '/studio', '/timesheets', '/profile', '/dazza-ai',
    '/team', '/billing', '/settings', '/help',
    '/user-logs', '/signin-history', '/quick-links', '/lists',
  ];

  for (const route of authRoutes) {
    it(`authenticated route ${route} is not in seo-routes`, () => {
      // Check for the route as a path value (quoted)
      expect(seoRoutesSrc).not.toContain(`"${route}"`);
      expect(seoRoutesSrc).not.toContain(`'${route}'`);
    });
  }
});

// ── 5. Unfinished routes have no route registration ───────────────────────────

describe('comingSoon routes have no route registration', () => {
  const unfinishedPaths = [
    '/report', '/site-diary', '/rainfall', '/checklist', '/messages', '/daily-log',
  ];

  for (const p of unfinishedPaths) {
    it(`${p} has no path registration in routes.tsx`, () => {
      // path: '/report' style registration must not exist
      expect(routesSrc).not.toMatch(new RegExp(`path:\\s*['"]${p.replace('/', '\\/')}['"]`));
    });

    it(`${p} has no lazy import in routes.tsx`, () => {
      // lazy(() => import('./pages/report')) style must not exist
      const pageName = p.replace('/', '');
      expect(routesSrc).not.toContain(`import('./pages/${pageName}')`);
    });
  }

  it('catch-all * route exists so unregistered paths reach NotFound', () => {
    expect(routesSrc).toContain("path: '*'");
    expect(routesSrc).toContain('NotFoundPage');
  });
});

// ── 6. /annette has no live file references ───────────────────────────────────

describe('/annette — no live file references', () => {
  it('routes.tsx does not import annette page component', () => {
    expect(routesSrc).not.toContain("import('./pages/annette')");
    expect(routesSrc).not.toContain("from './pages/annette'");
  });

  it('/annette route is a loader-only redirect (no element rendered)', () => {
    // The route must use a loader redirect, not render a page element
    const annetteBlock = routesSrc.match(/path:\s*['"]\/annette['"][^}]*}/s)?.[0] ?? '';
    expect(annetteBlock).toContain('loader');
    expect(annetteBlock).toContain('redirect');
    expect(annetteBlock).not.toContain('element:');
  });
});
