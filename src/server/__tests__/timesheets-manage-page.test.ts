/**
 * Timesheets on Manage page — placement, routing, and permission tests.
 *
 * Verifies:
 *  1. Timesheets icon appears in MANAGEMENT_ICON_DEFS (Manage page)
 *  2. Timesheets icon does NOT appear in COMING_SOON_ICON_DEFS
 *  3. Timesheets icon does NOT appear in JOB_FEATURES (Work & Field / job picker)
 *  4. Timesheets href routes to /finance?financeTab=timesheets (Finance shell)
 *  5. /timesheets page redirects to /finance?financeTab=timesheets (deep-link compat)
 *  6. Finance page does NOT redirect financeTab=timesheets away (timesheets stays in shell)
 *  7. /timesheets route is still registered in routes.tsx (deep-link compat)
 *  8. GET /api/finance/timesheets/me returns profile info (company isolation)
 *  9. GET /api/finance/timesheets enforces company isolation (workers see own)
 * 10. PortalSidebar timesheets link goes to Finance shell
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const src = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');

const managementIconsSrc = src('src/lib/homeIcons.ts');
const jobFeaturesSrc     = src('src/lib/jobFeatureRegistry.ts');
const timesheetsPageSrc  = src('src/pages/timesheets.tsx');
const financeSrc         = src('src/pages/finance.tsx');
const routesSrc          = src('src/routes.tsx');
const timesheetsGetSrc   = src('src/server/api/finance/timesheets/GET.ts');
const timesheetsMeSrc    = src('src/server/api/finance/timesheets/me/GET.ts');
const sidebarSrc         = src('src/components/PortalSidebar.tsx');

// ── 1. Timesheets in MANAGEMENT_ICON_DEFS ─────────────────────────────────────

describe('Timesheets icon placement', () => {
  it('is in MANAGEMENT_ICON_DEFS', () => {
    const mgmtBlock = managementIconsSrc.match(/MANAGEMENT_ICON_DEFS[\s\S]*?];/)?.[0] ?? '';
    expect(mgmtBlock).toContain("key: 'timesheet'");
  });

  it('is NOT in COMING_SOON_ICON_DEFS', () => {
    const comingSoonBlock = managementIconsSrc.match(/COMING_SOON_ICON_DEFS[\s\S]*?];/)?.[0] ?? '';
    expect(comingSoonBlock).not.toContain("key: 'timesheet'");
  });

  it('does NOT have comingSoon: true', () => {
    const timesheetEntry = managementIconsSrc.match(/key: 'timesheet'[^\n]*/)?.[0] ?? '';
    expect(timesheetEntry).not.toContain('comingSoon');
  });

  it('is NOT in JOB_FEATURES (Work & Field / job picker)', () => {
    expect(jobFeaturesSrc).not.toContain("key: 'timesheet'");
    expect(jobFeaturesSrc).not.toContain("key: 'timesheets'");
  });
});

// ── 2. Timesheets href — Finance shell ────────────────────────────────────────

describe('Timesheets icon href', () => {
  it('routes to /finance?financeTab=timesheets (Finance shell, not standalone page)', () => {
    const timesheetEntry = managementIconsSrc.match(/key: 'timesheet'[^\n]*/)?.[0] ?? '';
    expect(timesheetEntry).toContain("href: '/finance?financeTab=timesheets'");
    // Must NOT link to the bare /timesheets standalone page
    expect(timesheetEntry).not.toContain("href: '/timesheets'");
  });
});

// ── 3. /timesheets page — redirect only ──────────────────────────────────────

describe('/timesheets page (deep-link redirect)', () => {
  it('redirects to /finance?financeTab=timesheets', () => {
    expect(timesheetsPageSrc).toContain('/finance?financeTab=timesheets');
    expect(timesheetsPageSrc).toContain('replace: true');
  });

  it('does NOT render FinanceTimesheetsTab directly (redirect page only)', () => {
    // The redirect page should not embed the tab component — it just redirects
    expect(timesheetsPageSrc).not.toContain('<FinanceTimesheetsTab');
  });

  it('does NOT have a standalone page header with back button', () => {
    // The old standalone header is gone — redirect page has no chrome
    expect(timesheetsPageSrc).not.toContain('timesheets-back-button');
    expect(timesheetsPageSrc).not.toContain('portal-page');
    expect(timesheetsPageSrc).not.toContain('portal-content');
  });

  it('is marked seo-exempt (authenticated-only page)', () => {
    expect(timesheetsPageSrc).toContain('@seo-exempt');
  });
});

// ── 4. Route registration ─────────────────────────────────────────────────────

describe('/timesheets route', () => {
  it('is still registered in routes.tsx (deep-link compat)', () => {
    expect(routesSrc).toContain("path: '/timesheets'");
  });

  it('imports TimesheetsPage lazily', () => {
    expect(routesSrc).toContain("import('./pages/timesheets')");
  });
});

// ── 5. Finance page — no redirect away from timesheets tab ───────────────────

describe('Finance page — timesheets stays in shell', () => {
  it('does NOT redirect financeTab=timesheets to /timesheets', () => {
    // The old redirect is removed — timesheets renders inside the Finance shell
    expect(financeSrc).not.toContain("navigate('/timesheets'");
    expect(financeSrc).not.toContain("navigate(\"/timesheets\"");
  });

  it('TABS array includes timesheets', () => {
    expect(financeSrc).toContain("key: 'timesheets'");
  });

  it('renders FinanceTimesheetsTab for the timesheets tab', () => {
    expect(financeSrc).toContain('FinanceTimesheetsTab');
    expect(financeSrc).toContain("activeTab === 'timesheets'");
  });
});

// ── 6. PortalSidebar — timesheets link goes to Finance shell ─────────────────

describe('PortalSidebar timesheets link', () => {
  it('links to /finance?financeTab=timesheets (not /timesheets)', () => {
    expect(sidebarSrc).toContain("href: '/finance?financeTab=timesheets'");
    // Must NOT link to the bare /timesheets standalone page
    expect(sidebarSrc).not.toContain("href: '/timesheets'");
  });
});

// ── 7. API — company isolation ────────────────────────────────────────────────

describe('GET /api/finance/timesheets — company isolation', () => {
  it('passes companyId to the service (company isolation enforced in service layer)', () => {
    expect(timesheetsGetSrc).toContain('companyId: profile.companyId');
  });

  it('uses resolvePOProfile (authenticated session)', () => {
    expect(timesheetsGetSrc).toContain('resolvePOProfile');
  });
});

describe('GET /api/finance/timesheets/me — profile endpoint', () => {
  it('uses resolvePOProfile', () => {
    expect(timesheetsMeSrc).toContain('resolvePOProfile');
  });

  it('returns isAdmin flag', () => {
    expect(timesheetsMeSrc).toContain('isAdmin');
  });

  it('returns the authenticated user profile only', () => {
    expect(timesheetsMeSrc).toContain('profile.id');
  });
});
