/**
 * job-feature-permissions.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-level permission tests for job feature API endpoints.
 *
 * Proves:
 *  - Unauthenticated access returns 401 (mock req/res for handlers that can
 *    be imported without [id] path segments)
 *  - Cross-company isolation is enforced at source level
 *  - Company ID is derived from the server session (not client-supplied)
 *  - Timesheet employee identity is derived from session (not client-supplied)
 *  - Job search scopes by session company
 *  - JobFeatureShell backTo validation rejects external URLs
 *  - All 14 standalone pages export a default React component
 *  - All 14 features have backTo set in their standalone page
 *  - JobFeatureRegistry route uniqueness
 */

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

function src(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ── Minimal mock helpers ──────────────────────────────────────────────────────

function mockReq(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { headers: {}, params: {}, query: {}, body: {}, ...overrides };
}

function mockRes() {
  const res = {
    _status: 200,
    _body: null as unknown,
    status(code: number) { this._status = code; return this; },
    json(body: unknown) { this._body = body; return this; },
    send(body: unknown) { this._body = body; return this; },
  };
  return res;
}

// ── Auth mock — unauthenticated by default ────────────────────────────────────

vi.mock('@/lib/auth/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  }),
}));

vi.mock('../../db/client.js', () => ({
  db: {
    query: {
      profiles: { findFirst: vi.fn().mockResolvedValue(null) },
      jobs: { findFirst: vi.fn().mockResolvedValue(null) },
    },
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    execute: vi.fn().mockResolvedValue([[], {}]),
  },
}));

vi.mock('../../db/schema.js', () => ({
  jobs: {},
  profiles: {},
  timesheets: {},
  timesheetEntries: {},
}));

// Mock react-pdf to avoid DOMMatrix/canvas issues in jsdom
vi.mock('react-pdf', () => ({
  Document: () => null,
  Page: () => null,
  pdfjs: { GlobalWorkerOptions: {} },
}));

// ── 1. Jobs list handler — unauthenticated returns 401 ───────────────────────

describe('GET /api/jobs — authentication (401)', () => {
  it('returns 401 when unauthenticated', async () => {
    const { default: handler } = await import('../api/jobs/GET');
    const req = mockReq({ query: {} });
    const res = mockRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(401);
  });
});

// ── 2. Timesheet GET — unauthenticated returns 401 ───────────────────────────

describe('GET /api/finance/timesheets — authentication (401)', () => {
  it('returns 401 when unauthenticated', async () => {
    const { default: handler } = await import('../api/finance/timesheets/GET');
    const req = mockReq({ query: {} });
    const res = mockRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(401);
  });
});

// ── 3. Timesheet POST — unauthenticated returns 401 ──────────────────────────

describe('POST /api/finance/timesheets — authentication (401)', () => {
  it('returns 401 when unauthenticated', async () => {
    const { default: handler } = await import('../api/finance/timesheets/POST');
    const req = mockReq({ body: { weekEnding: '2026-08-24', entries: [] } });
    const res = mockRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(401);
  });
});

// ── 4. Source-level: job detail handler enforces all security guards ──────────

describe('GET /api/jobs/:id — source-level security guards', () => {
  const jobDetailSrc = src('src/server/api/jobs/[id]/GET.ts');

  it('returns 401 for unauthenticated requests', () => {
    expect(jobDetailSrc).toContain('res.status(401)');
  });

  it('returns 403 for cross-company access', () => {
    expect(jobDetailSrc).toContain('res.status(403)');
    expect(jobDetailSrc).toContain('job.companyId !== profile.companyId');
  });

  it('returns 404 for non-numeric job ID', () => {
    expect(jobDetailSrc).toContain('res.status(404)');
    expect(jobDetailSrc).toContain('isNaN(jobId)');
  });

  it('derives company from session profile, not query params', () => {
    expect(jobDetailSrc).not.toContain('req.query.companyId');
    expect(jobDetailSrc).not.toContain('req.body.companyId');
    expect(jobDetailSrc).toContain('profile.companyId');
  });
});

// ── 5. Source-level: timesheet employee identity from session ─────────────────

describe('POST /api/finance/timesheets — employee identity (source-level)', () => {
  const tsPostSrc = src('src/server/api/finance/timesheets/POST.ts');

  it('derives employeeProfileId from session profile.id by default', () => {
    expect(tsPostSrc).toContain('employeeProfileId: number = profile.id');
  });

  it('only allows admin to override employeeProfileId', () => {
    expect(tsPostSrc).toContain('profile.isAdmin');
  });

  it('verifies override employee belongs to same company', () => {
    expect(tsPostSrc).toContain('company_id = ${profile.companyId}');
  });

  it('does not accept client-supplied companyId', () => {
    expect(tsPostSrc).not.toContain('body.companyId');
    expect(tsPostSrc).not.toContain('req.query.companyId');
  });
});

// ── 6. Source-level: job search scopes by session company ────────────────────

describe('GET /api/jobs/search — company scoping (source-level)', () => {
  it('search handler file exists', () => {
    const searchPath = path.join(ROOT, 'src/server/api/jobs/search/GET.ts');
    expect(fs.existsSync(searchPath)).toBe(true);
  });

  it('search handler scopes by session-derived company ID', () => {
    const searchSrc = src('src/server/api/jobs/search/GET.ts');
    expect(searchSrc).toContain('companyId');
    expect(searchSrc).not.toContain('req.query.companyId');
  });
});

// ── 7. JobFeatureShell — backTo validation ────────────────────────────────────

describe('JobFeatureShell — deterministic back navigation', () => {
  const shellSrc = src('src/components/job/JobFeatureShell.tsx');

  it('validates backTo starts with / (rejects external URLs)', () => {
    expect(shellSrc).toContain("path.startsWith('/')");
  });

  it('rejects protocol-relative URLs (//)', () => {
    expect(shellSrc).toContain("!path.startsWith('//')");
  });

  it('falls back to / (home screen) for direct deep links (no history)', () => {
    expect(shellSrc).toContain("navigate('/')");
  });

  it('exports a default function component', async () => {
    const { default: JobFeatureShell } = await import('@/components/job/JobFeatureShell');
    expect(typeof JobFeatureShell).toBe('function');
  });
});

// ── 8. All 14 standalone pages export a default component ────────────────────

describe('Standalone job feature pages — module exports', () => {
  const pages = [
    ['tasks',           '@/pages/job-tasks-page'],
    ['notes',           '@/pages/job-notes-page'],
    ['delays',          '@/pages/job-delays-page'],
    ['progress',        '@/pages/job-progress-page'],
    ['attendance',      '@/pages/job-attendance-page'],
    ['photos',          '@/pages/job-photos-page'],
    ['drawings',        '@/pages/job-drawings-page'],
    ['files',           '@/pages/job-files-page'],
    ['estimates',       '@/pages/job-estimates-page'],
    ['purchase-orders', '@/pages/job-purchase-orders-page'],
    ['invoices',        '@/pages/job-invoices-page'],
    ['costs/ledger',    '@/pages/job-costs-page'],
    ['forms',           '@/pages/job-forms-page'],
    ['safety',          '@/pages/job-safety-page'],
  ] as const;

  pages.forEach(([feature, modulePath]) => {
    it(`${feature} page exports a default React component`, async () => {
      const mod = await import(modulePath);
      expect(typeof mod.default).toBe('function');
    });
  });
});

// ── 9. All 14 standalone pages have backTo set ───────────────────────────────

describe('Standalone pages — deterministic backTo prop', () => {
  const pageFiles = [
    'job-tasks-page.tsx', 'job-notes-page.tsx', 'job-delays-page.tsx',
    'job-progress-page.tsx', 'job-attendance-page.tsx', 'job-photos-page.tsx',
    'job-drawings-page.tsx', 'job-files-page.tsx', 'job-estimates-page.tsx',
    'job-purchase-orders-page.tsx', 'job-invoices-page.tsx', 'job-costs-page.tsx',
    'job-forms-page.tsx', 'job-safety-page.tsx',
  ];

  pageFiles.forEach(file => {
    it(`${file} passes backTo="/" to JobFeatureShell`, () => {
      const pageSrc = src(`src/pages/${file}`);
      expect(pageSrc).toContain('backTo="/"');
      expect(pageSrc).not.toMatch(/backTo="\/work-field/);
    });
  });
});

// ── 10. JobFeatureRegistry — route uniqueness ─────────────────────────────────

describe('JobFeatureRegistry — route validity and uniqueness', () => {
  it('has exactly 14 features', async () => {
    const { JOB_FEATURES } = await import('@/lib/jobFeatureRegistry');
    expect(JOB_FEATURES).toHaveLength(14);
  });

  it('all features produce valid standalone routes', async () => {
    const { JOB_FEATURES } = await import('@/lib/jobFeatureRegistry');
    JOB_FEATURES.forEach(f => {
      const route = f.standaloneRoute(42);
      expect(route).toMatch(/^\/jobs\/42\//);
    });
  });

  it('all features have launcher routes under /work-field/', async () => {
    const { JOB_FEATURES } = await import('@/lib/jobFeatureRegistry');
    JOB_FEATURES.forEach(f => {
      expect(f.launcherRoute).toMatch(/^\/work-field\//);
    });
  });

  it('no two features share the same standalone route template', async () => {
    const { JOB_FEATURES } = await import('@/lib/jobFeatureRegistry');
    const routes = JOB_FEATURES.map(f => f.standaloneRoute(1));
    const unique = new Set(routes);
    expect(unique.size).toBe(routes.length);
  });

  it('no two features share the same launcher route', async () => {
    const { JOB_FEATURES } = await import('@/lib/jobFeatureRegistry');
    const routes = JOB_FEATURES.map(f => f.launcherRoute);
    const unique = new Set(routes);
    expect(unique.size).toBe(routes.length);
  });
});
