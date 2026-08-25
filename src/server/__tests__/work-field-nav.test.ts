/**
 * work-field-nav.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * @seo-exempt — test file, not a route page
 *
 * Comprehensive tests for the final IWILLBUILD navigation model:
 *
 *   Path A — Inside an open Job (job-detail.tsx section dropdown)
 *   Path B — Work & Field launcher → Job picker → standalone page
 *
 * These are source-level tests that parse source files and assert structure
 * without needing a browser or DOM.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

function src(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ── Source files ──────────────────────────────────────────────────────────────

const registrySrc   = src('src/lib/jobFeatureRegistry.ts');
const launcherSrc   = src('src/pages/work-field.tsx');
const jobDetailSrc  = src('src/pages/job-detail.tsx');
const routesSrc     = src('src/routes.tsx');
const homeIconsSrc  = src('src/lib/homeIcons.ts');
const sidebarSrc    = src('src/components/PortalSidebar.tsx');
const manifestSrc   = src('public/manifest.json');
const indexHtmlSrc  = src('index.html');

// ── 1. Feature registry — all 14 features ────────────────────────────────────

const EXPECTED_KEYS = [
  'tasks', 'notes', 'delays', 'progress', 'attendance',
  'photos', 'drawings', 'files',
  'estimates', 'purchase-orders', 'invoices', 'costs',
  'forms', 'safety',
];

describe('Feature registry — completeness', () => {
  it('exports JOB_FEATURES array', () => {
    expect(registrySrc).toContain('export const JOB_FEATURES');
  });

  it('has exactly 14 features', () => {
    const matches = (registrySrc.match(/key: '/g) ?? []).length;
    expect(matches).toBe(14);
  });

  EXPECTED_KEYS.forEach(key => {
    it(`contains feature key "${key}"`, () => {
      expect(registrySrc).toContain(`key: '${key}'`);
    });
  });

  it('exports LAUNCHER_FEATURES', () => {
    expect(registrySrc).toContain('export const LAUNCHER_FEATURES');
  });

  it('exports DROPDOWN_FEATURES', () => {
    expect(registrySrc).toContain('export const DROPDOWN_FEATURES');
  });

  it('exports FEATURE_GROUPS', () => {
    expect(registrySrc).toContain('export const FEATURE_GROUPS');
  });

  it('exports getFeatureByKey helper', () => {
    expect(registrySrc).toContain('export function getFeatureByKey');
  });

  it('exports getFeatureByLauncherSlug helper', () => {
    expect(registrySrc).toContain('export function getFeatureByLauncherSlug');
  });
});

describe('Feature registry — groups', () => {
  const WORK_KEYS = ['tasks', 'notes', 'delays', 'progress', 'attendance'];
  const FIELD_KEYS = ['photos', 'drawings', 'files'];
  const FINANCE_KEYS = ['estimates', 'purchase-orders', 'invoices', 'costs'];
  const SAFETY_KEYS = ['forms', 'safety'];

  it('has Work group', () => {
    expect(registrySrc).toContain("group: 'Work'");
  });

  it('has Field & Files group', () => {
    expect(registrySrc).toContain("group: 'Field & Files'");
  });

  it('has Finance group', () => {
    expect(registrySrc).toContain("group: 'Finance'");
  });

  it('has Safety group', () => {
    expect(registrySrc).toContain("group: 'Safety'");
  });

  WORK_KEYS.forEach(k => {
    it(`"${k}" is in Work group`, () => {
      // Find the block for this key and check group
      const keyIdx = registrySrc.indexOf(`key: '${k}'`);
      const groupIdx = registrySrc.indexOf("group: 'Work'", keyIdx);
      const nextKeyIdx = registrySrc.indexOf('key:', keyIdx + 1);
      expect(groupIdx).toBeGreaterThan(keyIdx);
      if (nextKeyIdx > 0) expect(groupIdx).toBeLessThan(nextKeyIdx);
    });
  });

  FINANCE_KEYS.forEach(k => {
    it(`"${k}" is in Finance group`, () => {
      const keyIdx = registrySrc.indexOf(`key: '${k}'`);
      const groupIdx = registrySrc.indexOf("group: 'Finance'", keyIdx);
      const nextKeyIdx = registrySrc.indexOf('key:', keyIdx + 1);
      expect(groupIdx).toBeGreaterThan(keyIdx);
      if (nextKeyIdx > 0) expect(groupIdx).toBeLessThan(nextKeyIdx);
    });
  });
});

describe('Feature registry — standalone routes', () => {
  it('tasks standaloneRoute uses /jobs/:id/tasks', () => {
    expect(registrySrc).toContain('`/jobs/${id}/tasks`');
  });

  it('notes standaloneRoute uses /jobs/:id/notes', () => {
    expect(registrySrc).toContain('`/jobs/${id}/notes`');
  });

  it('delays standaloneRoute uses /jobs/:id/delays', () => {
    expect(registrySrc).toContain('`/jobs/${id}/delays`');
  });

  it('progress standaloneRoute uses /jobs/:id/progress', () => {
    expect(registrySrc).toContain('`/jobs/${id}/progress`');
  });

  it('attendance standaloneRoute uses /jobs/:id/attendance', () => {
    expect(registrySrc).toContain('`/jobs/${id}/attendance`');
  });

  it('photos standaloneRoute uses /jobs/:id/photos', () => {
    expect(registrySrc).toContain('`/jobs/${id}/photos`');
  });

  it('drawings standaloneRoute uses /jobs/:id/drawings', () => {
    expect(registrySrc).toContain('`/jobs/${id}/drawings`');
  });

  it('files standaloneRoute uses /jobs/:id/files', () => {
    expect(registrySrc).toContain('`/jobs/${id}/files`');
  });

  it('estimates standaloneRoute uses /jobs/:id/quotes (canonical existing route)', () => {
    expect(registrySrc).toContain('`/jobs/${id}/quotes`');
  });

  it('purchase-orders standaloneRoute uses /jobs/:id/purchase-orders', () => {
    expect(registrySrc).toContain('`/jobs/${id}/purchase-orders`');
  });

  it('invoices standaloneRoute uses /jobs/:id/invoices', () => {
    expect(registrySrc).toContain('`/jobs/${id}/invoices`');
  });

  it('costs standaloneRoute uses /jobs/:id/costs (backward compat key)', () => {
    expect(registrySrc).toContain('`/jobs/${id}/costs`');
  });

  it('forms standaloneRoute uses /jobs/:id/forms', () => {
    expect(registrySrc).toContain('`/jobs/${id}/forms`');
  });

  it('safety standaloneRoute uses /jobs/:id/safety', () => {
    expect(registrySrc).toContain('`/jobs/${id}/safety`');
  });
});

describe('Feature registry — launcher routes', () => {
  EXPECTED_KEYS.forEach(key => {
    it(`"${key}" has a launcherRoute starting with /work-field/`, () => {
      // Find the block for this key
      const keyIdx = registrySrc.indexOf(`key: '${key}'`);
      const launcherIdx = registrySrc.indexOf("launcherRoute: '/work-field/", keyIdx);
      const nextKeyIdx = registrySrc.indexOf('key:', keyIdx + 1);
      expect(launcherIdx).toBeGreaterThan(keyIdx);
      if (nextKeyIdx > 0) expect(launcherIdx).toBeLessThan(nextKeyIdx);
    });
  });
});

// ── 2. Work & Field launcher ──────────────────────────────────────────────────

describe('Work & Field launcher — structure', () => {
  it('imports from jobFeatureRegistry', () => {
    expect(launcherSrc).toContain("from '@/lib/jobFeatureRegistry'");
  });

  it('imports LAUNCHER_FEATURES', () => {
    expect(launcherSrc).toContain('LAUNCHER_FEATURES');
  });

  it('imports getFeatureByLauncherSlug', () => {
    expect(launcherSrc).toContain('getFeatureByLauncherSlug');
  });

  it('imports JobPickerSheet', () => {
    expect(launcherSrc).toContain("from '@/components/JobPickerSheet'");
  });

  it('uses data-testid for launcher cards', () => {
    expect(launcherSrc).toContain('data-testid={`launcher-card-${feature.key}`}');
  });

  it('uses data-testid for launcher groups', () => {
    expect(launcherSrc).toContain('data-testid={`launcher-group-${group.label}`}');
  });

  it('has 4 launcher groups (Work, Field & Files, Finance, Safety)', () => {
    const groups = ['Work', 'Field & Files', 'Finance', 'Safety'];
    groups.forEach(g => {
      expect(launcherSrc).toContain(`label: '${g}'`);
    });
  });

  it('opens picker on card click', () => {
    expect(launcherSrc).toContain('setPickerOpen(true)');
  });

  it('navigates to /work-field on picker close', () => {
    expect(launcherSrc).toContain("navigate('/work-field'");
  });

  it('navigates to standaloneRoute on job select', () => {
    expect(launcherSrc).toContain('pendingFeature.standaloneRoute(job.id)');
  });

  it('updates URL to /work-field/:featureSlug on card click (deep-link support)', () => {
    expect(launcherSrc).toContain('/work-field/');
  });

  it('opens picker immediately when featureSlug is in URL', () => {
    expect(launcherSrc).toContain('getFeatureByLauncherSlug(featureSlug)');
    expect(launcherSrc).toContain('setPickerOpen(true)');
  });
});

// ── 3. Path A — job-detail section dropdown ───────────────────────────────────

describe('Path A — job-detail section dropdown', () => {
  it('has all 14 feature tab keys in NAV_GROUPS', () => {
    EXPECTED_KEYS.forEach(key => {
      expect(jobDetailSrc).toContain(`key: '${key}'`);
    });
  });

  it('has 5 nav groups (Job + 4 feature groups)', () => {
    const groups = ['Job', 'Work', 'Field & Files', 'Finance', 'Safety'];
    groups.forEach(g => {
      expect(jobDetailSrc).toContain(`label: '${g}'`);
    });
  });

  it('section dropdown uses NAV_GROUPS (not a separate list)', () => {
    const count = (jobDetailSrc.match(/NAV_GROUPS\.map/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('dropdown has role="listbox"', () => {
    expect(jobDetailSrc).toContain('role="listbox"');
  });

  it('dropdown trigger has aria-haspopup="listbox"', () => {
    expect(jobDetailSrc).toContain('aria-haspopup="listbox"');
  });

  it('dropdown is hidden on desktop (md:hidden)', () => {
    expect(jobDetailSrc).toContain('md:hidden');
  });

  it('desktop side nav is shown on desktop (hidden md:flex)', () => {
    expect(jobDetailSrc).toContain('hidden md:flex');
  });

  it('dropdown anchors to trigger via getBoundingClientRect (no hardcoded top)', () => {
    expect(jobDetailSrc).toContain('getBoundingClientRect');
    expect(jobDetailSrc).not.toContain("top: 'calc(56px + 56px + 44px)'");
  });

  it('stale MobileTabBar comment is removed', () => {
    expect(jobDetailSrc).not.toContain('MobileTabBar');
  });
});

// ── 4. Routes — all standalone routes registered ─────────────────────────────

describe('Routes — standalone feature routes registered', () => {
  const STANDALONE_ROUTES = [
    '/jobs/:jobId/tasks',
    '/jobs/:jobId/attendance',
    '/jobs/:jobId/files',
    '/jobs/:jobId/estimates',
    '/jobs/:jobId/purchase-orders',
    '/jobs/:jobId/invoices',
    '/jobs/:jobId/safety',
    '/work-field',
    '/work-field/:featureSlug',
  ];

  STANDALONE_ROUTES.forEach(route => {
    it(`route "${route}" is registered`, () => {
      expect(routesSrc).toContain(`path: '${route}'`);
    });
  });

  it('WorkFieldPage is lazy-imported', () => {
    expect(routesSrc).toContain("import('./pages/work-field')");
  });

  it('JobTasksPage is lazy-imported', () => {
    expect(routesSrc).toContain("import('./pages/job-tasks-page')");
  });

  it('JobAttendancePage is lazy-imported', () => {
    expect(routesSrc).toContain("import('./pages/job-attendance-page')");
  });

  it('JobFilesPage is lazy-imported', () => {
    expect(routesSrc).toContain("import('./pages/job-files-page')");
  });

  it('JobEstimatesPage is lazy-imported', () => {
    expect(routesSrc).toContain("import('./pages/job-estimates-page')");
  });

  it('JobPurchaseOrdersPage is lazy-imported', () => {
    expect(routesSrc).toContain("import('./pages/job-purchase-orders-page')");
  });

  it('JobInvoicesPage is lazy-imported', () => {
    expect(routesSrc).toContain("import('./pages/job-invoices-page')");
  });

  it('JobSafetyPage is lazy-imported', () => {
    expect(routesSrc).toContain("import('./pages/job-safety-page')");
  });

  it('legacy /work/:workTab route is preserved for backward compat', () => {
    expect(routesSrc).toContain("path: '/work/:workTab'");
  });
});

// ── 5. Tablet navigation gap fix ─────────────────────────────────────────────

describe('Tablet navigation gap — breakpoint fix', () => {
  it('desktop sidebar uses md: breakpoint (not lg:)', () => {
    expect(sidebarSrc).toContain('hidden md:flex flex-col');
    expect(sidebarSrc).not.toContain('hidden lg:flex flex-col');
  });

  it('mobile drawer backdrop uses md:hidden (not lg:hidden)', () => {
    expect(sidebarSrc).toContain('z-40 md:hidden');
    expect(sidebarSrc).not.toContain('z-40 lg:hidden');
  });

  it('mobile drawer panel uses md:hidden (not lg:hidden)', () => {
    expect(sidebarSrc).toContain('z-50 md:hidden');
    expect(sidebarSrc).not.toContain('z-50 lg:hidden');
  });

  it('DesktopTopBar uses hidden md:flex (not hidden lg:flex)', () => {
    const topBarSrc = src('src/components/DesktopTopBar.tsx');
    expect(topBarSrc).toContain('hidden md:flex');
    expect(topBarSrc).not.toContain('hidden lg:flex');
  });
});

// ── 6. homeIcons.ts fixes ─────────────────────────────────────────────────────

describe('homeIcons.ts — fixes', () => {
  it('progress icon routes to /work-field/progress (not /work?workTab=progress)', () => {
    expect(homeIconsSrc).toContain("href: '/work-field/progress'");
    expect(homeIconsSrc).not.toContain("href: '/work?workTab=progress'");
  });

  it('timesheet comingSoon icon routes to /finance?financeTab=timesheets (not /timesheets)', () => {
    expect(homeIconsSrc).toContain("href: '/finance?financeTab=timesheets'");
    expect(homeIconsSrc).not.toContain("href: '/timesheets'");
  });

  it('Work & Field icon is present in FIELD_ICON_DEFS', () => {
    expect(homeIconsSrc).toContain("key: 'work_field'");
    expect(homeIconsSrc).toContain("href: '/work-field'");
  });
});

// ── 7. Sidebar — Work & Field entry ──────────────────────────────────────────

describe('Sidebar — Work & Field nav entry', () => {
  it('sidebar has Work & Field nav item', () => {
    expect(sidebarSrc).toContain("label: 'Work & Field'");
  });

  it('Work & Field nav item links to /work-field', () => {
    expect(sidebarSrc).toContain("href: '/work-field'");
  });
});

// ── 8. Canonical components — no duplication ─────────────────────────────────

describe('Canonical components — no duplication', () => {
  it('job-tasks-page.tsx imports JobTodos (canonical)', () => {
    const tasksSrc = src('src/pages/job-tasks-page.tsx');
    expect(tasksSrc).toContain("from '@/components/job/JobTodos'");
  });

  it('job-attendance-page.tsx imports JobAttendanceTab (canonical)', () => {
    const attSrc = src('src/pages/job-attendance-page.tsx');
    expect(attSrc).toContain("from '@/components/job/JobAttendanceTab'");
  });

  it('job-files-page.tsx imports FilePanel (canonical)', () => {
    const filesSrc = src('src/pages/job-files-page.tsx');
    expect(filesSrc).toContain("from '@/components/FilePanel'");
  });

  it('job-estimates-page.tsx imports JobEstimates (canonical)', () => {
    const estSrc = src('src/pages/job-estimates-page.tsx');
    expect(estSrc).toContain("from '@/components/JobEstimates'");
  });

  it('job-purchase-orders-page.tsx imports JobPurchaseOrders (canonical)', () => {
    const poSrc = src('src/pages/job-purchase-orders-page.tsx');
    expect(poSrc).toContain("from '@/components/job/JobPurchaseOrders'");
  });

  it('job-invoices-page.tsx imports JobInvoices (canonical)', () => {
    const invSrc = src('src/pages/job-invoices-page.tsx');
    expect(invSrc).toContain("from '@/components/job/JobInvoices'");
  });

  it('job-safety-page.tsx imports JobSafety (canonical)', () => {
    const safSrc = src('src/pages/job-safety-page.tsx');
    expect(safSrc).toContain("from '@/components/job/JobSafety'");
  });

  it('job-notes-page.tsx imports NotesPanel (canonical)', () => {
    const notesSrc = src('src/pages/job-notes-page.tsx');
    expect(notesSrc).toContain("from '@/components/notes/NotesPanel'");
  });

  it('job-delays-page.tsx imports JobDelays (canonical)', () => {
    const delaysSrc = src('src/pages/job-delays-page.tsx');
    expect(delaysSrc).toContain("from '@/components/job/JobDelays'");
  });

  it('job-progress-page.tsx imports ProgramOfWorksView (canonical)', () => {
    const progSrc = src('src/pages/job-progress-page.tsx');
    expect(progSrc).toContain("from '@/components/pow/ProgramOfWorksView'");
  });

  it('job-photos-page.tsx imports JobPhotos (canonical)', () => {
    const photosSrc = src('src/pages/job-photos-page.tsx');
    expect(photosSrc).toContain("from '@/components/JobPhotos'");
  });

  it('job-drawings-page.tsx imports JobPlanManagerTab (canonical)', () => {
    const drawSrc = src('src/pages/job-drawings-page.tsx');
    expect(drawSrc).toContain("from '@/components/PlanManager/JobPlanManagerTab'");
  });

  it('job-forms-page.tsx exists and is not a duplicate of studio-forms', () => {
    const formsSrc = src('src/pages/job-forms-page.tsx');
    expect(formsSrc).not.toContain("from './studio-forms'");
  });

  it('job-costs-page.tsx imports JobCosts (canonical)', () => {
    const costsSrc = src('src/pages/job-costs-page.tsx');
    expect(costsSrc).toContain("from '@/components/job/JobCosts'");
  });
});

// ── 9. Feature shell ──────────────────────────────────────────────────────────

describe('JobFeatureShell — shared standalone wrapper', () => {
  const shellSrc = src('src/components/job/JobFeatureShell.tsx');

  it('renders Back button', () => {
    expect(shellSrc).toContain('ArrowLeft');
  });

  it('renders feature icon and label', () => {
    expect(shellSrc).toContain('featureLabel');
    expect(shellSrc).toContain('Icon');
  });

  it('renders job name and number', () => {
    expect(shellSrc).toContain('jobName');
    expect(shellSrc).toContain('jobNumber');
  });

  it('renders Change Job button', () => {
    expect(shellSrc).toContain('onChangeJob');
    expect(shellSrc).toContain('Change Job');
  });

  it('has mobile header (md:hidden)', () => {
    expect(shellSrc).toContain('md:hidden');
  });

  it('has desktop header (hidden md:flex)', () => {
    expect(shellSrc).toContain('hidden md:flex');
  });
});

// ── 10. useJobForFeature hook ─────────────────────────────────────────────────

describe('useJobForFeature — shared data hook', () => {
  const hookSrc = src('src/lib/useJobForFeature.ts');

  it('reads jobId from URL params', () => {
    expect(hookSrc).toContain("useParams<{ jobId: string }>()");
  });

  it('uses fetchJob (server-enforced company isolation)', () => {
    expect(hookSrc).toContain('fetchJob');
  });

  it('returns loading state', () => {
    expect(hookSrc).toContain('loading');
  });

  it('returns error state', () => {
    expect(hookSrc).toContain('error');
  });

  it('handles invalid job ID safely', () => {
    expect(hookSrc).toContain('Invalid job ID');
  });

  it('handles access denied safely', () => {
    expect(hookSrc).toContain('access denied');
  });
});

// ── 11. Path B — Change Job preserves feature ────────────────────────────────

describe('Path B — Change Job preserves feature', () => {
  it('job-tasks-page navigates to /work-field/tasks on Change Job', () => {
    const tasksSrc = src('src/pages/job-tasks-page.tsx');
    expect(tasksSrc).toContain("navigate('/work-field/tasks')");
  });

  it('job-attendance-page navigates to /work-field/attendance on Change Job', () => {
    const attSrc = src('src/pages/job-attendance-page.tsx');
    expect(attSrc).toContain("navigate('/work-field/attendance')");
  });

  it('job-files-page navigates to /work-field/files on Change Job', () => {
    const filesSrc = src('src/pages/job-files-page.tsx');
    expect(filesSrc).toContain("navigate('/work-field/files')");
  });

  it('job-estimates-page navigates to /work-field/estimates on Change Job', () => {
    const estSrc = src('src/pages/job-estimates-page.tsx');
    expect(estSrc).toContain("navigate('/work-field/estimates')");
  });

  it('job-purchase-orders-page navigates to /work-field/purchase-orders on Change Job', () => {
    const poSrc = src('src/pages/job-purchase-orders-page.tsx');
    expect(poSrc).toContain("navigate('/work-field/purchase-orders')");
  });

  it('job-invoices-page navigates to /work-field/invoices on Change Job', () => {
    const invSrc = src('src/pages/job-invoices-page.tsx');
    expect(invSrc).toContain("navigate('/work-field/invoices')");
  });

  it('job-safety-page navigates to /work-field/safety on Change Job', () => {
    const safSrc = src('src/pages/job-safety-page.tsx');
    expect(safSrc).toContain("navigate('/work-field/safety')");
  });
});

// ── 12. Timesheets — not in job picker launcher ───────────────────────────────

describe('Timesheets — not in job picker launcher', () => {
  it('Timesheets is NOT in LAUNCHER_FEATURES (not a job-scoped feature)', () => {
    expect(registrySrc).not.toContain("key: 'timesheets'");
    expect(registrySrc).not.toContain("key: 'timesheet'");
  });

  it('Timesheets comingSoon entry routes to /finance?financeTab=timesheets', () => {
    expect(homeIconsSrc).toContain("href: '/finance?financeTab=timesheets'");
  });

  it('Timesheets is NOT in the Work & Field launcher groups', () => {
    expect(launcherSrc).not.toContain('timesheet');
  });
});

// ── 13. PWA fixes ─────────────────────────────────────────────────────────────

describe('PWA fixes', () => {
  it('manifest start_url is /home (not /dashboard)', () => {
    const manifest = JSON.parse(manifestSrc);
    expect(manifest.start_url).toBe('/home');
  });

  it('manifest theme_color is IWILLBUILD purple #7C3AED', () => {
    const manifest = JSON.parse(manifestSrc);
    expect(manifest.theme_color.toLowerCase()).toBe('#7c3aed');
  });

  it('index.html theme-color meta is #7C3AED', () => {
    expect(indexHtmlSrc).toContain('content="#7C3AED"');
  });

  it('index.html has apple-touch-icon link', () => {
    expect(indexHtmlSrc).toContain('apple-touch-icon');
  });
});

// ── 14. Legacy backward-compat ────────────────────────────────────────────────

describe('Legacy backward-compat', () => {
  it('/work/:workTab route is still registered', () => {
    expect(routesSrc).toContain("path: '/work/:workTab'");
  });

  it('/work route is still registered', () => {
    expect(routesSrc).toContain("path: '/work'");
  });

  it('/jobs/:id route is still registered (Path A entry)', () => {
    expect(routesSrc).toContain("path: '/jobs/:id'");
  });
});

// ── 15. No duplicate feature lists ───────────────────────────────────────────

describe('No duplicate feature lists', () => {
  it('work-field.tsx does NOT define its own feature array', () => {
    // Should not contain a local array of feature objects with keys
    expect(launcherSrc).not.toContain("key: 'tasks'");
    expect(launcherSrc).not.toContain("key: 'notes'");
  });

  it('work-field.tsx imports from jobFeatureRegistry (single source of truth)', () => {
    expect(launcherSrc).toContain("from '@/lib/jobFeatureRegistry'");
  });

  it('work-job-picker.tsx still exists (backward compat) but is not the primary launcher', () => {
    const pickerSrc = src('src/pages/work-job-picker.tsx');
    expect(pickerSrc).toBeTruthy();
  });
});
