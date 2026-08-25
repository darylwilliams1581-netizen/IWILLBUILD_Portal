/**
 * Timesheets on Manage page — placement, routing, and permission tests.
 *
 * Verifies:
 *  1. Timesheets icon appears in MANAGEMENT_ICON_DEFS (Manage page)
 *  2. Timesheets icon does NOT appear in COMING_SOON_ICON_DEFS
 *  3. Timesheets icon does NOT appear in JOB_FEATURES (Work & Field / job picker)
 *  4. Timesheets href routes to /timesheets (not /finance?financeTab=timesheets)
 *  5. /timesheets page exists and renders a back button
 *  6. /timesheets page renders FinanceTimesheetsTab (the canonical component)
 *  7. /timesheets page has a back-to-manage control
 *  8. /timesheets page has an h1 heading
 *  9. Finance page redirects /finance?financeTab=timesheets → /timesheets
 * 10. GET /api/finance/timesheets/me returns profile info (company isolation)
 * 11. GET /api/finance/timesheets enforces company isolation (workers see own)
 * 12. Timesheets page is registered in routes.tsx
 * 13. Mobile layout: page uses portal-page + portal-content structure
 * 14. No job picker import in timesheets page
 * 15. No employee selector in timesheets page
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

// ── 1. Timesheets in MANAGEMENT_ICON_DEFS ─────────────────────────────────────

describe('Timesheets icon placement', () => {
  it('is in MANAGEMENT_ICON_DEFS', () => {
    // The management block must contain the timesheet key
    const mgmtBlock = managementIconsSrc.match(/MANAGEMENT_ICON_DEFS[\s\S]*?];/)?.[0] ?? '';
    expect(mgmtBlock).toContain("key: 'timesheet'");
  });

  it('is NOT in COMING_SOON_ICON_DEFS', () => {
    const comingSoonBlock = managementIconsSrc.match(/COMING_SOON_ICON_DEFS[\s\S]*?];/)?.[0] ?? '';
    expect(comingSoonBlock).not.toContain("key: 'timesheet'");
  });

  it('does NOT have comingSoon: true', () => {
    // Find the timesheet entry and confirm it has no comingSoon flag
    const timesheetEntry = managementIconsSrc.match(/key: 'timesheet'[^\n]*/)?.[0] ?? '';
    expect(timesheetEntry).not.toContain('comingSoon');
  });

  it('is NOT in JOB_FEATURES (Work & Field / job picker)', () => {
    expect(jobFeaturesSrc).not.toContain("key: 'timesheet'");
    expect(jobFeaturesSrc).not.toContain("key: 'timesheets'");
  });
});

// ── 2. Timesheets href ────────────────────────────────────────────────────────

describe('Timesheets icon href', () => {
  it('routes to /timesheets (not /finance?financeTab=timesheets)', () => {
    const timesheetEntry = managementIconsSrc.match(/key: 'timesheet'[^\n]*/)?.[0] ?? '';
    expect(timesheetEntry).toContain("href: '/timesheets'");
    expect(timesheetEntry).not.toContain('/finance?financeTab=timesheets');
  });
});

// ── 3. /timesheets page structure ─────────────────────────────────────────────

describe('/timesheets page', () => {
  it('renders FinanceTimesheetsTab', () => {
    expect(timesheetsPageSrc).toContain('FinanceTimesheetsTab');
  });

  it('has a back button with aria-label "Back to Manage"', () => {
    expect(timesheetsPageSrc).toContain('Back to Manage');
    expect(timesheetsPageSrc).toContain('timesheets-back-button');
  });

  it('has an h1 heading', () => {
    expect(timesheetsPageSrc).toMatch(/<h1[^>]*>/);
  });

  it('uses portal-page layout (mobile-compatible)', () => {
    expect(timesheetsPageSrc).toContain('portal-page');
    expect(timesheetsPageSrc).toContain('portal-content');
  });

  it('does NOT import a job picker', () => {
    expect(timesheetsPageSrc).not.toContain('JobPicker');
    expect(timesheetsPageSrc).not.toContain('job-picker');
    expect(timesheetsPageSrc).not.toContain('picker=');
  });

  it('does NOT include an employee selector', () => {
    expect(timesheetsPageSrc).not.toContain('EmployeeSelect');
    expect(timesheetsPageSrc).not.toContain('employee-selector');
    expect(timesheetsPageSrc).not.toContain('Select employee');
  });

  it('navigates back to home manage page', () => {
    // Back button should navigate to /?page=2 (Manage page)
    expect(timesheetsPageSrc).toContain('/?page=2');
  });

  it('is marked seo-exempt (authenticated-only page)', () => {
    expect(timesheetsPageSrc).toContain('@seo-exempt');
  });
});

// ── 4. Route registration ─────────────────────────────────────────────────────

describe('/timesheets route', () => {
  it('is registered in routes.tsx', () => {
    expect(routesSrc).toContain("path: '/timesheets'");
  });

  it('imports TimesheetsPage lazily', () => {
    expect(routesSrc).toContain("import('./pages/timesheets')");
  });

  it('is protected (wrapped in protect())', () => {
    // The route element must use protect()
    const timesheetsRoute = routesSrc.match(/path: '\/timesheets'[\s\S]*?errorElement/)?.[0] ?? '';
    expect(timesheetsRoute).toContain('protect(');
  });
});

// ── 5. Finance page legacy redirect ──────────────────────────────────────────

describe('Finance page legacy redirect', () => {
  it('redirects financeTab=timesheets to /timesheets', () => {
    expect(financeSrc).toContain("activeTab === 'timesheets'");
    expect(financeSrc).toContain("navigate('/timesheets'");
  });

  it('uses replace:true for the redirect (no history entry)', () => {
    const redirectBlock = financeSrc.match(/activeTab === 'timesheets'[\s\S]*?}\s*},?\s*\[/)?.[0] ?? '';
    expect(redirectBlock).toContain('replace: true');
  });
});

// ── 6. API — company isolation ────────────────────────────────────────────────

describe('GET /api/finance/timesheets — company isolation', () => {
  it('passes companyId to the service (company isolation enforced in service layer)', () => {
    // The handler passes profile.companyId to listTimesheets — isolation is in the service
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
    // Must filter by profile.id (not expose all profiles)
    expect(timesheetsMeSrc).toContain('profile.id');
  });
});
