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
    '/jobs', '/work', '/job-cards', '/scheduler',
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
    '/studio/forms', '/safety?safetyTab=documents', '/safety/posters',
    '/incidents', '/risk-register',
    // Management
    '/timesheets', '/profile', '/dazza-ai',
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
  it('dazza_ai is ownerOnly', () => {
    const line = homeIconsSrc.match(/key: 'dazza_ai'[^\n]*/)?.[0] ?? '';
    expect(line).toContain('ownerOnly: true');
  });

  it('asset_mgr is adminOnly', () => {
    const line = homeIconsSrc.match(/key: 'asset_mgr'[^\n]*/)?.[0] ?? '';
    expect(line).toContain('adminOnly: true');
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

describe('PortalSidebar — Finance timesheets link', () => {
  it('links directly to /timesheets (not /finance?financeTab=timesheets)', () => {
    expect(sidebarSrc).toContain("href: '/timesheets'");
    expect(sidebarSrc).not.toContain("href: '/finance?financeTab=timesheets'");
  });
});

// ── 6. No comingSoon entries for routes that now exist ────────────────────────

describe('No stale comingSoon entries for live routes', () => {
  it('risk-register is not in comingSoon', () => {
    const comingSoonBlock = homeIconsSrc.match(/COMING_SOON_ICON_DEFS[\s\S]*?];/)?.[0] ?? '';
    expect(comingSoonBlock).not.toContain('/risk-register');
  });

  it('dazza-ai is not in comingSoon', () => {
    const comingSoonBlock = homeIconsSrc.match(/COMING_SOON_ICON_DEFS[\s\S]*?];/)?.[0] ?? '';
    expect(comingSoonBlock).not.toContain('/dazza-ai');
  });
});
