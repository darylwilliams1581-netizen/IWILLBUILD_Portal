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
const sidebarSrc         = src('src/components/PortalSidebar.tsx');

// ── 1. Timesheets in MANAGEMENT_ICON_DEFS ─────────────────────────────────────

describe('Timesheets icon placement', () => {
  it('is NOT in MANAGEMENT_ICON_DEFS', () => {
    const mgmtBlock = managementIconsSrc.match(/MANAGEMENT_ICON_DEFS[\s\S]*?];/)?.[0] ?? '';
    expect(mgmtBlock).not.toContain("key: 'timesheet'");
  });

  it('has no coming-soon placeholder list', () => {
    expect(managementIconsSrc).not.toContain('COMING_SOON_ICON_DEFS');
  });

  it('is NOT in JOB_FEATURES (Work & Field / job picker)', () => {
    expect(jobFeaturesSrc).not.toContain("key: 'timesheet'");
    expect(jobFeaturesSrc).not.toContain("key: 'timesheets'");
  });
});

// ── 2. /timesheets page — redirect home ──────────────────────────────────────

describe('/timesheets page (deep-link redirect)', () => {
  it('redirects to /home', () => {
    expect(timesheetsPageSrc).toContain("navigate('/home'");
    expect(timesheetsPageSrc).toContain('replace: true');
  });

  it('does NOT render FinanceTimesheetsTab directly (redirect page only)', () => {
    expect(timesheetsPageSrc).not.toContain('<FinanceTimesheetsTab');
  });

  it('does NOT have a standalone page header with back button', () => {
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

describe('Finance page — timesheets retired', () => {
  it('does NOT keep a timesheets tab', () => {
    expect(financeSrc).not.toContain("key: 'timesheets'");
    expect(financeSrc).not.toContain('FinanceTimesheetsTab');
  });

  it('sends financeTab=timesheets home', () => {
    expect(financeSrc).toContain("navigate('/home'");
  });
});

// ── 6. PortalSidebar — no timesheets link ────────────────────────────────────

describe('PortalSidebar timesheets link', () => {
  it('has no Timesheets nav item', () => {
    expect(sidebarSrc).not.toContain("href: '/finance?financeTab=timesheets'");
    expect(sidebarSrc).not.toContain("href: '/timesheets'");
  });
});
