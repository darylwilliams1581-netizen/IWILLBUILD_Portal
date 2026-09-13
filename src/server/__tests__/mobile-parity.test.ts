/**
 * Mobile home screen parity tests.
 *
 * Verifies that every function accessible from the desktop sidebar is also
 * reachable from the mobile home screen icon grid (via homeIcons.ts), with
 * correct role-gating (adminOnly / ownerOnly) matching the sidebar's
 * adminOnly / ownerOnly flags.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const src = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');

const homeIconsSrc   = src('src/lib/homeIcons.ts');
const sidebarSrc     = src('src/components/PortalSidebar.tsx');
const permGridSrc    = src('src/components/team/HomeIconPermissions.tsx');
const pagedHomeSrc   = src('src/components/home/PagedHomeScreen.tsx');
const topBarSrc      = src('src/components/DesktopTopBar.tsx');
const loginSrc       = src('src/pages/login.tsx');
const helpSrc        = src('src/pages/help.tsx');
const serverEntrySrc = src('src/server/entry.ts');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract all href values from homeIcons.ts (live icons only — not comingSoon) */
function liveHrefs(): string[] {
  // Match lines that have an href and do NOT have comingSoon: true
  const lines = homeIconsSrc.split('\n');
  const hrefs: string[] = [];
  for (const line of lines) {
    if (line.includes('comingSoon: true')) continue;
    const m = line.match(/href:\s*'([^']+)'/);
    if (m) hrefs.push(m[1]);
  }
  return hrefs;
}

// ── 1. Core routes present in homeIcons ──────────────────────────────────────

describe('Mobile home screen — core routes present', () => {
  const hrefs = liveHrefs();

  const required = [
    // Field
    '/jobs', '/work?workTab=tools', '/job-cards', '/scheduler',
    // Files
    '/lens', '/plan-manager', '/files', '/studio/asset-manager',
    // Fleet
    '/fleet',
    // Finance
    '/finance?financeTab=estimates', '/invoices',
    '/finance?financeTab=ledger', '/finance?financeTab=purchase-orders',
    '/estimating', '/builders-calc', '/takeoff-pad',
    '/finance?financeTab=settings',
    // Safety
    '/studio/forms', '/studio/documents', '/safety/posters',
    '/incidents', '/risk-register',
    // Management
    '/profile', '/dazza-ai',
    '/studio/documents', '/studio/library', '/quick-links', '/lists',
    '/user-logs', '/signin-history',
    '/team', '/billing', '/settings', '/help',
  ];

  for (const route of required) {
    it(`includes ${route}`, () => {
      expect(hrefs).toContain(route);
    });
  }
});

// ── 2. adminOnly / ownerOnly flags ────────────────────────────────────────────

describe('Role-gating flags on homeIcons', () => {
  it('dazza_ai is platformOnly', () => {
    const line = homeIconsSrc.match(/key: 'dazza_ai'[^\n]*/)?.[0] ?? '';
    expect(line).toContain('platformOnly: true');
    expect(line).not.toContain('ownerOnly: true');
  });

  it('asset_mgr is Equipment Manager on Work, not admin-only', () => {
    const line = homeIconsSrc.match(/key: 'asset_mgr'[^\n]*/)?.[0] ?? '';
    expect(line).toContain("label: 'Equipment Manager'");
    expect(line).not.toContain('adminOnly: true');
  });

  it('finance_settings is adminOnly', () => {
    const line = homeIconsSrc.match(/key: 'finance_settings'[^\n]*/)?.[0] ?? '';
    expect(line).toContain('adminOnly: true');
  });

  it('estimating is adminOnly', () => {
    const line = homeIconsSrc.match(/key: 'estimating'[^\n]*/)?.[0] ?? '';
    expect(line).toContain('adminOnly: true');
  });

  it('app_docs is adminOnly', () => {
    const line = homeIconsSrc.match(/key: 'app_docs'[^\n]*/)?.[0] ?? '';
    expect(line).toContain('adminOnly: true');
  });

  it('library is adminOnly', () => {
    const line = homeIconsSrc.match(/key: 'library'[^\n]*/)?.[0] ?? '';
    expect(line).toContain('adminOnly: true');
  });

  it('quick_links is adminOnly', () => {
    const line = homeIconsSrc.match(/key: 'quick_links'[^\n]*/)?.[0] ?? '';
    expect(line).toContain('adminOnly: true');
  });

  it('lists is adminOnly', () => {
    const line = homeIconsSrc.match(/key: 'lists'[^\n]*/)?.[0] ?? '';
    expect(line).toContain('adminOnly: true');
  });

  it('user_logs is adminOnly', () => {
    const line = homeIconsSrc.match(/key: 'user_logs'[^\n]*/)?.[0] ?? '';
    expect(line).toContain('adminOnly: true');
  });

  it('signin_history is adminOnly', () => {
    const line = homeIconsSrc.match(/key: 'signin_history'[^\n]*/)?.[0] ?? '';
    expect(line).toContain('adminOnly: true');
  });

  it('team is adminOnly', () => {
    const line = homeIconsSrc.match(/key: 'team'[^\n]*/)?.[0] ?? '';
    expect(line).toContain('adminOnly: true');
  });

  it('profile has no adminOnly or ownerOnly (all users)', () => {
    const line = homeIconsSrc.match(/key: 'profile'[^\n]*/)?.[0] ?? '';
    expect(line).not.toContain('adminOnly');
    expect(line).not.toContain('ownerOnly');
  });

  it('builders_calc has no adminOnly (all users)', () => {
    const line = homeIconsSrc.match(/key: 'builders_calc'[^\n]*/)?.[0] ?? '';
    expect(line).not.toContain('adminOnly');
  });

  it('takeoff_pad has no adminOnly (all users)', () => {
    const line = homeIconsSrc.match(/key: 'takeoff_pad'[^\n]*/)?.[0] ?? '';
    expect(line).not.toContain('adminOnly');
  });
});

// ── 3. resolveHomeIcons respects adminOnly / ownerOnly ────────────────────────

describe('resolveHomeIcons — role gating logic', () => {
  it('filters platformOnly icons unless isPlatformOwner is true', () => {
    expect(homeIconsSrc).toContain('i.platformOnly && !isPlatformOwner');
  });
  it('uses ADMIN_ROLES set for adminOnly filtering', () => {
    expect(homeIconsSrc).toContain("ADMIN_ROLES = new Set(['owner', 'admin', 'platform_owner'])");
  });

  it('uses OWNER_ROLES set for ownerOnly filtering', () => {
    expect(homeIconsSrc).toContain("OWNER_ROLES = new Set(['owner', 'platform_owner'])");
  });

  it('filters ownerOnly icons for non-owners', () => {
    expect(homeIconsSrc).toContain('i.ownerOnly && !isOwner');
  });

  it('filters adminOnly icons for non-admins', () => {
    expect(homeIconsSrc).toContain('i.adminOnly && !isAdmin');
  });
});

describe('Platform tools stay exclusive to the IWILLBUILD platform owner', () => {
  it('passes the platform-owner flag into phone icon resolution', () => {
    expect(pagedHomeSrc).toContain('resolveHomeIcons(iconPermissions, role, isSolo, isPlatformOwner)');
    expect(pagedHomeSrc).toContain('...(isPlatformOwner ? platformAsIconDef : [])');
  });

  it('uses isPlatformOwner for the desktop Dazza and Console controls', () => {
    expect(topBarSrc).toContain('{isPlatformOwner && <>');
    expect(topBarSrc).not.toContain('OWNER_EMAIL');
    expect(topBarSrc).not.toContain('isOwnerEmail');
  });

  it('does not advertise platform-only tools in Help to normal users', () => {
    expect(helpSrc).toContain('!icon.platformOnly || isPlatformOwner');
  });

  it('invalidates cached /api/me permissions during login and logout', () => {
    expect(loginSrc).toContain('invalidateMeCache();');
    expect(pagedHomeSrc).toContain('invalidateMeCache();');
    expect(topBarSrc).toContain('invalidateMeCache();');
  });

  it('protects every Dazza API route with the platform-owner middleware', () => {
    expect(serverEntrySrc).toContain('app.use("/api/dazza", requirePlatformOwner);');
  });
});

// ── 4. HomeIconPermissions grid respects adminOnly / ownerOnly ────────────────

describe('HomeIconPermissions — permission grid role gating', () => {
  it('hides ownerOnly icons from non-owner members', () => {
    expect(permGridSrc).toContain('i.ownerOnly && !isOwnerRole');
  });

  it('hides adminOnly icons from non-admin members', () => {
    expect(permGridSrc).toContain('i.adminOnly && !isAdminRole');
  });

  it('profile is in locked keys for owner/admin', () => {
    expect(permGridSrc).toContain("'profile'");
  });
});

// ── 5. Sidebar parity — Finance timesheets link updated ───────────────────────

describe('PortalSidebar — Timesheets retired', () => {
  it('has no timesheets nav href', () => {
    expect(sidebarSrc).not.toContain("href: '/finance?financeTab=timesheets'");
    expect(sidebarSrc).not.toContain("href: '/timesheets'");
  });
});

// ── 6. No comingSoon entries for routes that now exist ────────────────────────

describe('No comingSoon placeholder tiles', () => {
  it('COMING_SOON_ICON_DEFS is gone', () => {
    expect(homeIconsSrc).not.toContain('COMING_SOON_ICON_DEFS');
    expect(homeIconsSrc).not.toContain('comingSoon: true');
  });
});
