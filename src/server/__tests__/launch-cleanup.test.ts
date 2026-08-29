/**
 * Launch-cleanup regression tests.
 *
 * Proves the invariants required before going live:
 *   1. comingSoon entries are absent from navigation (PortalSidebar) and Help
 *   2. /download-app and /subscribe are absent from seo-routes (sitemap)
 *   3. Authenticated portal routes are excluded from seo-routes
 *   4. Unfinished (comingSoon) hrefs have no route registration → standard 404
 *   5. /annette is protected (loader-only redirect, no page element, not in sitemap)
 *
 * These tests read source files directly so they catch regressions at CI time
 * without needing a running server.
 *
 * NOTE on /annette: Annette is an intentional, permanent, owner-only intelligence
 * and oversight layer — not a dev page. Tests here verify it is protected and
 * excluded from public search, not that it is removed.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const src = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');

const homeIconsSrc = src('src/lib/homeIcons.ts');
const sidebarSrc   = src('src/components/PortalSidebar.tsx');
const helpSrc      = src('src/pages/help.tsx');
const routesSrc    = src('src/routes.tsx');
const seoRoutesSrc = src('src/lib/seo-routes.ts');

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

/** Extract all comingSoon keys from homeIcons.ts */
function comingSoonKeys(): string[] {
  const lines = homeIconsSrc.split('\n');
  const keys: string[] = [];
  for (const line of lines) {
    if (!line.includes('comingSoon: true')) continue;
    const m = line.match(/key:\s*'([^']+)'/);
    if (m) keys.push(m[1]);
  }
  return keys;
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

/** Extract path values from seo-routes.ts (ignores comments) */
function seoPathValues(): string[] {
  return [...seoRoutesSrc.matchAll(/path:\s*["']([^"']+)["']/g)].map(m => m[1]);
}

// ── 1. comingSoon entries absent from navigation ──────────────────────────────

describe('comingSoon entries absent from PortalSidebar navigation', () => {
  // Only test hrefs that are exclusively comingSoon (not shared with a live icon).
  // Some hrefs (e.g. /invoices) appear in both a live icon and a comingSoon variant —
  // the sidebar legitimately links to those via the live icon.
  const live = liveHrefs();
  const exclusivelyComingSoon = comingSoonHrefs().filter(h => !live.has(h));

  it('has at least one exclusively-comingSoon href to test against', () => {
    expect(exclusivelyComingSoon.length).toBeGreaterThan(0);
  });

  for (const href of exclusivelyComingSoon) {
    it(`sidebar does not link to ${href}`, () => {
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

  it('Help does not import individual group arrays directly', () => {
    // If Help imports individual group arrays it could accidentally include comingSoon icons
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
      // comingSoon icons must not have ICON_DOCS entries — they are not shown in Help
      expect(helpSrc).not.toContain(`  ${key}:`);
    });
  }

  it('VISIBLE_GROUP_CONFIG in homeIcons.ts filters out comingSoon entries', () => {
    expect(homeIconsSrc).toContain('VISIBLE_GROUP_CONFIG');
    expect(homeIconsSrc).toContain('!i.comingSoon');
    expect(homeIconsSrc).toContain('comingSoon group intentionally excluded');
  });
});

// ── 3. Sitemap exclusions ─────────────────────────────────────────────────────

describe('seo-routes.ts — sitemap exclusions', () => {
  it('/download-app is NOT a path value in seo-routes', () => {
    expect(seoPathValues()).not.toContain('/download-app');
  });

  it('/subscribe is NOT a path value in seo-routes', () => {
    expect(seoPathValues()).not.toContain('/subscribe');
  });

  it('/annette is NOT a path value in seo-routes', () => {
    // Annette is owner-only intelligence — never publicly indexed
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
    '/annette',
  ];

  for (const route of authRoutes) {
    it(`authenticated route ${route} is not in seo-routes`, () => {
      expect(seoPathValues()).not.toContain(route);
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
      expect(routesSrc).not.toMatch(new RegExp(`path:\\s*['"]${p.replace('/', '\\/')}['"]`));
    });

    it(`${p} has no lazy import in routes.tsx`, () => {
      const pageName = p.replace('/', '');
      expect(routesSrc).not.toContain(`import('./pages/${pageName}')`);
    });
  }

  it('catch-all * route exists so unregistered paths reach NotFound', () => {
    expect(routesSrc).toContain("path: '*'");
    expect(routesSrc).toContain('NotFoundPage');
  });
});

// ── 6. /annette — protected, not removed ─────────────────────────────────────
//
// Annette is an intentional, permanent, owner-only intelligence and oversight
// layer for IWILLBUILD. These tests verify she is protected and excluded from
// public search — not that she is removed.

describe('/annette — protected and owner-gated', () => {
  it('routes.tsx does not render an annette page component (loader-only redirect)', () => {
    expect(routesSrc).not.toContain("import('./pages/annette')");
    expect(routesSrc).not.toContain("from './pages/annette'");
  });

  it('/annette route uses a loader redirect (no public element rendered)', () => {
    const annetteBlock = routesSrc.match(/path:\s*['"]\/annette['"][^}]*}/s)?.[0] ?? '';
    expect(annetteBlock).toContain('loader');
    expect(annetteBlock).toContain('redirect');
    expect(annetteBlock).not.toContain('element:');
  });

  it('/annette is not in the public sitemap', () => {
    expect(seoPathValues()).not.toContain('/annette');
  });
});
