/**
 * opening-page-nav.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for the simplified navigation model:
 *
 *   Home screen (Page 1) → 14 job-feature icons → Job picker → standalone page
 *
 * Covers:
 *  1. All 14 icons appear directly on the opening page (registry check)
 *  2. No duplicate feature icons (unique keys)
 *  3. Work & Field button no longer appears in PortalSidebar or homeIcons
 *  4. Each icon has a pickerRoute pointing to /?picker=<key>
 *  5. Job selection opens the correct standalone feature route
 *  6. Back returns to / (home screen)
 *  7. Change Job navigates to /?picker=<key>
 *  8. /work-field redirects safely (source-level)
 *  9. /work-field/:slug redirects to /?picker=<key> (source-level)
 * 10. Inside-Job dropdown bypasses the picker (uses ?tab= directly)
 * 11. Timesheets not using the Job picker
 * 12. JobFeatureShell fallback is / not /work-field
 * 13. PagedHomeScreen imports SharedJobPickerSheet (not local copy)
 * 14. Registry has exactly 14 features, all inOpeningPage
 * 15. No /work-field hrefs remain in homeIcons.ts
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

function src(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ── 1. All 14 features have inOpeningPage: true ───────────────────────────────

describe('Registry — all 14 features on opening page', () => {
  it('has exactly 14 features', async () => {
    const { JOB_FEATURES } = await import('@/lib/jobFeatureRegistry');
    expect(JOB_FEATURES).toHaveLength(14);
  });

  it('all 14 features have inOpeningPage: true', async () => {
    const { JOB_FEATURES } = await import('@/lib/jobFeatureRegistry');
    JOB_FEATURES.forEach(f => {
      expect(f.inOpeningPage).toBe(true);
    });
  });

  it('OPENING_PAGE_FEATURES has 14 entries', async () => {
    const { OPENING_PAGE_FEATURES } = await import('@/lib/jobFeatureRegistry');
    expect(OPENING_PAGE_FEATURES).toHaveLength(14);
  });
});

// ── 2. No duplicate feature icons ────────────────────────────────────────────

describe('Registry — no duplicate feature icons', () => {
  it('all feature keys are unique', async () => {
    const { JOB_FEATURES } = await import('@/lib/jobFeatureRegistry');
    const keys = JOB_FEATURES.map(f => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('all pickerRoutes are unique', async () => {
    const { JOB_FEATURES } = await import('@/lib/jobFeatureRegistry');
    const routes = JOB_FEATURES.map(f => f.pickerRoute);
    expect(new Set(routes).size).toBe(routes.length);
  });
});

// ── 3. Work & Field button removed from PortalSidebar and homeIcons ───────────

describe('Work & Field button removed', () => {
  it('PortalSidebar has no Work & Field nav item', () => {
    const sidebarSrc = src('src/components/PortalSidebar.tsx');
    expect(sidebarSrc).not.toContain("label: 'Work & Field'");
    expect(sidebarSrc).not.toContain("href: '/work-field'");
  });

  it('homeIcons.ts has no work_field icon', () => {
    const iconsSrc = src('src/lib/homeIcons.ts');
    expect(iconsSrc).not.toContain("key: 'work_field'");
    expect(iconsSrc).not.toContain("href: '/work-field'");
  });

  it('homeIcons.ts has no duplicate progress icon pointing to /work-field', () => {
    const iconsSrc = src('src/lib/homeIcons.ts');
    expect(iconsSrc).not.toContain("href: '/work-field/progress'");
  });

  it('homeIcons.ts has no duplicate delays icon pointing to work-field panel', () => {
    const iconsSrc = src('src/lib/homeIcons.ts');
    // delays-picker was a panel handler — now handled by registry
    expect(iconsSrc).not.toContain("key: 'delays'");
  });

  it('homeIcons.ts has no duplicate notes icon pointing to work-field panel', () => {
    const iconsSrc = src('src/lib/homeIcons.ts');
    expect(iconsSrc).not.toContain("key: 'notes'");
  });
});

// ── 4. Each icon has a pickerRoute pointing to /home?picker=<key> ────────────

describe('Registry — pickerRoute format', () => {
  it('all pickerRoutes start with /home?picker=', async () => {
    const { JOB_FEATURES } = await import('@/lib/jobFeatureRegistry');
    JOB_FEATURES.forEach(f => {
      expect(f.pickerRoute).toMatch(/^\/home\?picker=/);
    });
  });

  it('pickerRoute key matches feature key', async () => {
    const { JOB_FEATURES } = await import('@/lib/jobFeatureRegistry');
    JOB_FEATURES.forEach(f => {
      expect(f.pickerRoute).toBe(`/home?picker=${f.key}`);
    });
  });
});

// ── 5. Job selection opens the correct standalone feature route ───────────────

describe('Registry — standaloneRoute correctness', () => {
  it('tasks → /jobs/42/tasks', async () => {
    const { getFeatureByKey } = await import('@/lib/jobFeatureRegistry');
    expect(getFeatureByKey('tasks')?.standaloneRoute(42)).toBe('/jobs/42/tasks');
  });

  it('photos → /jobs/42/photos', async () => {
    const { getFeatureByKey } = await import('@/lib/jobFeatureRegistry');
    expect(getFeatureByKey('photos')?.standaloneRoute(42)).toBe('/jobs/42/photos');
  });

  it('costs → /jobs/42/costs', async () => {
    const { getFeatureByKey } = await import('@/lib/jobFeatureRegistry');
    expect(getFeatureByKey('costs')?.standaloneRoute(42)).toBe('/jobs/42/costs');
  });

  it('estimates → /jobs/42/quotes', async () => {
    const { getFeatureByKey } = await import('@/lib/jobFeatureRegistry');
    expect(getFeatureByKey('estimates')?.standaloneRoute(42)).toBe('/jobs/42/quotes');
  });
});

// ── 6. Back returns to /home (app home screen) ───────────────────────────────

describe('Standalone pages — backTo="/home"', () => {
  const pageFiles = [
    'job-tasks-page.tsx', 'job-notes-page.tsx', 'job-delays-page.tsx',
    'job-progress-page.tsx', 'job-attendance-page.tsx', 'job-photos-page.tsx',
    'job-drawings-page.tsx', 'job-files-page.tsx', 'job-estimates-page.tsx',
    'job-purchase-orders-page.tsx', 'job-invoices-page.tsx', 'job-costs-page.tsx',
    'job-forms-page.tsx', 'job-safety-page.tsx',
  ];

  pageFiles.forEach(file => {
    it(`${file} has backTo="/home"`, () => {
      const pageSrc = src(`src/pages/${file}`);
      expect(pageSrc).toContain('backTo="/home"');
      expect(pageSrc).not.toMatch(/backTo="\/work-field/);
    });
  });
});

// ── 7. Change Job navigates to /home?picker=<key> ─────────────────────────────

describe('Standalone pages — Change Job navigates to /home?picker=<key>', () => {
  it('job-tasks-page navigates to /home?picker=tasks on Change Job', () => {
    const pageSrc = src('src/pages/job-tasks-page.tsx');
    expect(pageSrc).toContain("navigate('/home?picker=tasks')");
    expect(pageSrc).not.toContain("navigate('/work-field");
  });

  it('job-photos-page navigates to /home?picker=photos on Change Job', () => {
    const pageSrc = src('src/pages/job-photos-page.tsx');
    expect(pageSrc).toContain("navigate('/home?picker=photos')");
    expect(pageSrc).not.toContain("navigate('/work-field");
  });

  it('job-costs-page navigates to /home?picker=costs on Change Job', () => {
    const pageSrc = src('src/pages/job-costs-page.tsx');
    expect(pageSrc).toContain("navigate('/home?picker=costs')");
    expect(pageSrc).not.toContain("navigate('/work-field");
  });

  it('job-safety-page navigates to /home?picker=safety on Change Job', () => {
    const pageSrc = src('src/pages/job-safety-page.tsx');
    expect(pageSrc).toContain("navigate('/home?picker=safety')");
    expect(pageSrc).not.toContain("navigate('/work-field");
  });

  it('job-progress-page navigates to /home?picker=progress on Change Job', () => {
    const pageSrc = src('src/pages/job-progress-page.tsx');
    expect(pageSrc).toContain("navigate('/home?picker=progress')");
    expect(pageSrc).not.toContain("navigate('/work-field");
  });
});

// ── 8 & 9. /work-field redirects safely ──────────────────────────────────────

describe('/work-field redirect page', () => {
  const redirectSrc = src('src/pages/work-field.tsx');

  it('redirects /work-field to /home (home)', () => {
    expect(redirectSrc).toContain("navigate('/home', { replace: true })");
  });

  it('redirects /work-field/:slug to /home?picker=<key>', () => {
    expect(redirectSrc).toContain('navigate(`/home?picker=${feature.key}`');
  });

  it('uses getFeatureByLauncherSlug to resolve slug', () => {
    expect(redirectSrc).toContain('getFeatureByLauncherSlug(featureSlug)');
  });

  it('is marked noindex', () => {
    expect(redirectSrc).toContain('noindex');
  });

  it('does not render any visible UI (just redirect)', () => {
    // Should not contain any visible content sections
    expect(redirectSrc).not.toContain('<main');
    expect(redirectSrc).not.toContain('<section');
  });
});

// ── 10. Inside-Job dropdown bypasses the picker ───────────────────────────────

describe('Inside-Job dropdown — bypasses picker', () => {
  it('job-detail uses ?tab= URL state, not picker', () => {
    const detailSrc = src('src/pages/job-detail.tsx');
    expect(detailSrc).toContain("get('tab')");
    // Job detail should NOT open a job picker
    expect(detailSrc).not.toContain('picker=');
  });

  it('DROPDOWN_FEATURES has 14 entries', async () => {
    const { DROPDOWN_FEATURES } = await import('@/lib/jobFeatureRegistry');
    expect(DROPDOWN_FEATURES).toHaveLength(14);
  });
});

// ── 11. Timesheets not using the Job picker ───────────────────────────────────

describe('Timesheets — no Job picker', () => {
  it('finance page timesheets tab does not use JobPickerSheet', () => {
    const financeSrc = src('src/pages/finance.tsx');
    // Timesheets are employee-scoped, not job-scoped
    expect(financeSrc).not.toContain('picker=timesheets');
  });

  it('timesheets icon in homeIcons points to /finance?financeTab=timesheets (Finance shell)', () => {
    const iconsSrc = src('src/lib/homeIcons.ts');
    expect(iconsSrc).toContain("href: '/finance?financeTab=timesheets'");
    // Must NOT link to the bare /timesheets standalone page
    expect(iconsSrc).not.toContain("href: '/timesheets'");
  });
});

// ── 12. JobFeatureShell fallback is / not /work-field ────────────────────────

describe('JobFeatureShell — safe fallback to /', () => {
  const shellSrc = src('src/components/job/JobFeatureShell.tsx');

  it('fallback navigate goes to / not /work-field', () => {
    expect(shellSrc).toContain("navigate('/')");
    expect(shellSrc).not.toContain("navigate('/work-field')");
  });

  it('back label uses "Home" for backTo="/" or backTo="/home"', () => {
    expect(shellSrc).toContain("(backTo === '/' || backTo === '/home') ? 'Home'");
  });

  it('still validates backTo starts with /', () => {
    expect(shellSrc).toContain("path.startsWith('/')");
    expect(shellSrc).toContain("!path.startsWith('//')");
  });
});

// ── 13. PagedHomeScreen uses SharedJobPickerSheet ────────────────────────────

describe('PagedHomeScreen — uses shared JobPickerSheet', () => {
  const screenSrc = src('src/components/home/PagedHomeScreen.tsx');

  it('imports SharedJobPickerSheet from @/components/JobPickerSheet', () => {
    expect(screenSrc).toContain("import SharedJobPickerSheet from '@/components/JobPickerSheet'");
  });

  it('imports OPENING_PAGE_FEATURES from registry', () => {
    expect(screenSrc).toContain('OPENING_PAGE_FEATURES');
  });

  it('imports FEATURE_GROUPS from registry', () => {
    expect(screenSrc).toContain('FEATURE_GROUPS');
  });

  it('renders opening-page-job-features testid', () => {
    expect(screenSrc).toContain('data-testid="opening-page-job-features"');
  });

  it('renders opening-page-card-<key> testids', () => {
    expect(screenSrc).toContain('data-testid={`opening-page-card-${feature.key}`}');
  });

  it('does not contain the old local JobPickerSheet component', () => {
    // Old local component navigated to /jobs/:id/photos — now handled by registry
    expect(screenSrc).not.toContain("navigate(`/jobs/${jobId}/photos`)");
  });

  it('handles ?picker= query param to auto-open picker', () => {
    expect(screenSrc).toContain("searchParams.get('picker')");
    expect(screenSrc).toContain('getFeatureByKey(key)');
  });
});

// ── 14. Registry — OPENING_PAGE_FEATURES matches LAUNCHER_FEATURES (alias) ───

describe('Registry — LAUNCHER_FEATURES is alias for OPENING_PAGE_FEATURES', () => {
  it('LAUNCHER_FEATURES and OPENING_PAGE_FEATURES are the same array', async () => {
    const { LAUNCHER_FEATURES, OPENING_PAGE_FEATURES } = await import('@/lib/jobFeatureRegistry');
    expect(LAUNCHER_FEATURES).toBe(OPENING_PAGE_FEATURES);
  });
});

// ── 15. No /work-field hrefs remain in homeIcons.ts ──────────────────────────

describe('homeIcons.ts — no /work-field hrefs', () => {
  it('no icon href points to /work-field', () => {
    const iconsSrc = src('src/lib/homeIcons.ts');
    expect(iconsSrc).not.toMatch(/href: '\/work-field/);
  });
});

// ── 16. getFeatureByLauncherSlug still works for backward compat ──────────────

describe('getFeatureByLauncherSlug — backward compat', () => {
  it('resolves "tasks" slug to tasks feature', async () => {
    const { getFeatureByLauncherSlug } = await import('@/lib/jobFeatureRegistry');
    const f = getFeatureByLauncherSlug('tasks');
    expect(f?.key).toBe('tasks');
  });

  it('resolves "ledger" slug to costs feature', async () => {
    const { getFeatureByLauncherSlug } = await import('@/lib/jobFeatureRegistry');
    const f = getFeatureByLauncherSlug('ledger');
    expect(f?.key).toBe('costs');
  });

  it('resolves "safety" slug to safety feature', async () => {
    const { getFeatureByLauncherSlug } = await import('@/lib/jobFeatureRegistry');
    const f = getFeatureByLauncherSlug('safety');
    expect(f?.key).toBe('safety');
  });

  it('returns undefined for unknown slug', async () => {
    const { getFeatureByLauncherSlug } = await import('@/lib/jobFeatureRegistry');
    expect(getFeatureByLauncherSlug('unknown-slug')).toBeUndefined();
  });
});
