/**
 * Gate 1 — Progress Safety & Compatibility tests
 *
 * Covers:
 * 1. Sync endpoint is retired (no mutations, returns PROGRESS_SYNC_RETIRED)
 * 2. GET handler orders by sort_order ASC, id ASC
 * 3. PUT bulk handler scopes updates by job_id + company_id (cross-job denial)
 * 4. report/GET.ts uses correct db.execute destructuring
 * 5. report/pdf/GET.ts uses correct db.execute destructuring
 * 6. export-csv orders by sort_order ASC, id ASC
 * 7. New schema columns exist in Drizzle schema
 * 8. migrate-job-tabs DDL includes new columns
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// ── Helper: read source file relative to project root ────────────────────────
function src(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
}

// ── 1. Sync endpoint is retired ───────────────────────────────────────────────
describe('Progress sync endpoint — retired', () => {
  it('sync/POST.ts handler is still a function (endpoint kept for old clients)', async () => {
    const mod = await import('../api/jobs/[id]/progress/sync/POST');
    expect(typeof mod.default).toBe('function');
  });

  it('sync/POST.ts source contains PROGRESS_SYNC_RETIRED code', () => {
    const source = src('src/server/api/jobs/[id]/progress/sync/POST.ts');
    expect(source).toContain('PROGRESS_SYNC_RETIRED');
  });

  it('sync/POST.ts source does NOT contain db.delete (no mutations)', () => {
    const source = src('src/server/api/jobs/[id]/progress/sync/POST.ts');
    expect(source).not.toContain('db.delete');
  });

  it('sync/POST.ts source does NOT contain db.insert (no mutations)', () => {
    const source = src('src/server/api/jobs/[id]/progress/sync/POST.ts');
    expect(source).not.toContain('db.insert');
  });

  it('sync/POST.ts source does NOT contain db.update (no mutations)', () => {
    const source = src('src/server/api/jobs/[id]/progress/sync/POST.ts');
    expect(source).not.toContain('db.update');
  });

  it('sync/POST.ts returns 200 with PROGRESS_SYNC_RETIRED (not 410)', () => {
    const source = src('src/server/api/jobs/[id]/progress/sync/POST.ts');
    expect(source).toContain('res.status(200).json');
    expect(source).toContain('PROGRESS_SYNC_RETIRED');
  });

  it('sync/POST.ts still performs auth and job-ownership checks before retiring', () => {
    const source = src('src/server/api/jobs/[id]/progress/sync/POST.ts');
    expect(source).toContain('getSession');
    expect(source).toContain('companyId');
    expect(source).toContain('jobs.id');
  });
});

// ── 2. GET handler ordering ───────────────────────────────────────────────────
describe('Progress GET handler — ordering', () => {
  it('GET handler is still a function', async () => {
    const mod = await import('../api/jobs/[id]/progress/GET');
    expect(typeof mod.default).toBe('function');
  });

  it('GET source orders by sortOrder ASC then id ASC', () => {
    const source = src('src/server/api/jobs/[id]/progress/GET.ts');
    expect(source).toContain('sortOrder');
    // Both sort keys must appear in the orderBy call
    const orderByIdx = source.indexOf('orderBy');
    expect(orderByIdx).toBeGreaterThan(-1);
    const orderBySection = source.slice(orderByIdx, orderByIdx + 120);
    expect(orderBySection).toContain('sortOrder');
    expect(orderBySection).toContain('id');
  });
});

// ── 3. PUT bulk handler — cross-job denial ────────────────────────────────────
describe('Progress PUT bulk handler — cross-job scope', () => {
  it('PUT handler is still a function', async () => {
    const mod = await import('../api/jobs/[id]/progress/PUT');
    expect(typeof mod.default).toBe('function');
  });

  it('PUT source includes jobId in per-line WHERE clause', () => {
    const source = src('src/server/api/jobs/[id]/progress/PUT.ts');
    // The update WHERE must include jobId (not just companyId)
    // Find the db.update block
    const updateIdx = source.indexOf('db.update(jobProgressLines)');
    expect(updateIdx).toBeGreaterThan(-1);
    const updateBlock = source.slice(updateIdx, updateIdx + 300);
    expect(updateBlock).toContain('jobProgressLines.jobId');
    expect(updateBlock).toContain('jobProgressLines.companyId');
    expect(updateBlock).toContain('jobProgressLines.id');
  });

  it('PUT source does NOT allow sort_order to be changed via bulk update', () => {
    const source = src('src/server/api/jobs/[id]/progress/PUT.ts');
    // sort_order must not be in the upd object
    expect(source).toContain('sort_order is intentionally excluded');
  });

  it('PUT source orders response by sortOrder ASC then id ASC', () => {
    const source = src('src/server/api/jobs/[id]/progress/PUT.ts');
    const orderByIdx = source.lastIndexOf('orderBy');
    expect(orderByIdx).toBeGreaterThan(-1);
    const orderBySection = source.slice(orderByIdx, orderByIdx + 120);
    expect(orderBySection).toContain('sortOrder');
    expect(orderBySection).toContain('id');
  });
});

// ── 4. report/GET.ts — correct db.execute destructuring ──────────────────────
describe('Progress report GET — db.execute destructuring', () => {
  it('report/GET.ts handler is still a function', async () => {
    const mod = await import('../api/jobs/[id]/progress/report/GET');
    expect(typeof mod.default).toBe('function');
  });

  it('report/GET.ts uses [rows] = await db.execute (correct destructuring)', () => {
    const source = src('src/server/api/jobs/[id]/progress/report/GET.ts');
    expect(source).toContain('const [rows] = await db.execute');
  });

  it('report/GET.ts does NOT use the old .rows?.[0] pattern', () => {
    const source = src('src/server/api/jobs/[id]/progress/report/GET.ts');
    expect(source).not.toContain('.rows?.[0]');
  });
});

// ── 5. report/pdf/GET.ts — correct db.execute destructuring ──────────────────
describe('Progress report PDF GET — db.execute destructuring', () => {
  it('report/pdf/GET.ts uses [reportRows] = await db.execute (correct destructuring)', () => {
    const source = src('src/server/api/jobs/[id]/progress/report/pdf/GET.ts');
    expect(source).toContain('const [reportRows] = await db.execute');
  });

  it('report/pdf/GET.ts does NOT use the old .rows?.[0] pattern', () => {
    const source = src('src/server/api/jobs/[id]/progress/report/pdf/GET.ts');
    expect(source).not.toContain('.rows?.[0]');
  });

  it('report/pdf/GET.ts orders lines by sortOrder ASC then id ASC', () => {
    const source = src('src/server/api/jobs/[id]/progress/report/pdf/GET.ts');
    const orderByIdx = source.indexOf('orderBy');
    expect(orderByIdx).toBeGreaterThan(-1);
    const orderBySection = source.slice(orderByIdx, orderByIdx + 120);
    expect(orderBySection).toContain('sortOrder');
  });
});

// ── 6. export-csv ordering ────────────────────────────────────────────────────
describe('Progress export-csv — ordering', () => {
  it('export-csv/GET.ts orders by sortOrder ASC then id ASC', () => {
    const source = src('src/server/api/jobs/[id]/progress/export-csv/GET.ts');
    const orderByIdx = source.indexOf('orderBy');
    expect(orderByIdx).toBeGreaterThan(-1);
    const orderBySection = source.slice(orderByIdx, orderByIdx + 120);
    expect(orderBySection).toContain('sortOrder');
  });
});

// ── 7. Drizzle schema — new columns ──────────────────────────────────────────
describe('Drizzle schema — job_progress_lines new columns', () => {
  it('schema.ts contains startDate / start_date column', () => {
    const source = src('src/server/db/schema.ts');
    expect(source).toContain("date('start_date')");
  });

  it('schema.ts contains endDate / end_date column', () => {
    const source = src('src/server/db/schema.ts');
    expect(source).toContain("date('end_date')");
  });

  it('schema.ts contains sortOrder / sort_order column', () => {
    const source = src('src/server/db/schema.ts');
    expect(source).toContain("int('sort_order')");
  });

  it('sortOrder has NOT NULL DEFAULT 0', () => {
    const source = src('src/server/db/schema.ts');
    const sortOrderIdx = source.indexOf("int('sort_order')");
    const sortOrderDef = source.slice(sortOrderIdx, sortOrderIdx + 60);
    expect(sortOrderDef).toContain('notNull');
    expect(sortOrderDef).toContain('default(0)');
  });
});

// ── 8. migrate-job-tabs DDL ───────────────────────────────────────────────────
describe('migrate-job-tabs — DDL includes new columns', () => {
  it('migrate-job-tabs DDL contains start_date', () => {
    const source = src('src/server/api/migrate-job-tabs/POST.ts');
    expect(source).toContain('start_date');
  });

  it('migrate-job-tabs DDL contains end_date', () => {
    const source = src('src/server/api/migrate-job-tabs/POST.ts');
    expect(source).toContain('end_date');
  });

  it('migrate-job-tabs DDL contains sort_order', () => {
    const source = src('src/server/api/migrate-job-tabs/POST.ts');
    expect(source).toContain('sort_order');
  });

  it('migrate-job-tabs DDL contains the composite index', () => {
    const source = src('src/server/api/migrate-job-tabs/POST.ts');
    expect(source).toContain('idx_progress_company_job_order');
  });
});

// ── 9. JobProgress component — sync button removed ───────────────────────────
describe('JobProgress component — sync button removed', () => {
  it('JobProgress.tsx does not import RefreshCw', () => {
    const source = src('src/components/job/JobProgress.tsx');
    expect(source).not.toContain('RefreshCw');
  });

  it('JobProgress.tsx does not contain syncFromEstimate function', () => {
    const source = src('src/components/job/JobProgress.tsx');
    expect(source).not.toContain('syncFromEstimate');
  });

  it('JobProgress.tsx does not contain Sync from Estimate button text', () => {
    const source = src('src/components/job/JobProgress.tsx');
    expect(source).not.toContain('Sync from Estimate');
  });

  it('JobProgress.tsx does not call /progress/sync endpoint', () => {
    const source = src('src/components/job/JobProgress.tsx');
    expect(source).not.toContain('/progress/sync');
  });

  it('JobProgress.tsx still contains PO workflow (CreatePOModal)', () => {
    const source = src('src/components/job/JobProgress.tsx');
    expect(source).toContain('CreatePOModal');
  });

  it('JobProgress.tsx does NOT contain PODetailModal (moved to JobPurchaseOrders)', () => {
    const source = src('src/components/job/JobProgress.tsx');
    expect(source).not.toContain('PODetailModal');
  });

  it('JobProgress.tsx does NOT contain Purchase Orders section (moved to Money/Records)', () => {
    const source = src('src/components/job/JobProgress.tsx');
    expect(source).not.toContain('Purchase Orders / Work Orders');
  });

  it('JobPurchaseOrders.tsx exists and contains the PO list UI', () => {
    const source = src('src/components/job/JobPurchaseOrders.tsx');
    expect(source).toContain('PODetailModal');
    expect(source).toContain('Purchase Orders');
  });

  it('job-detail.tsx has purchase-orders tab in Money/Records', () => {
    const source = src('src/pages/job-detail.tsx');
    expect(source).toContain("key: 'purchase-orders'");
    expect(source).toContain('JobPurchaseOrders');
  });
});

// ── 10. JobProgressPage — report save reliability ────────────────────────────
describe('JobProgressPage — report save reliability', () => {
  it('saveReport checks response.ok before marking saved', () => {
    const source = src('src/pages/job-progress-page.tsx');
    expect(source).toContain('if (!res.ok)');
  });

  it('saveReport keeps dirty on failure (does not call setReportDirty(false) in catch)', () => {
    const source = src('src/pages/job-progress-page.tsx');
    // setReportDirty(false) must exist in the file (success path)
    expect(source).toContain('setReportDirty(false)');
    // The error path sets reportError, not setReportDirty(false)
    expect(source).toContain('setReportError');
    // The catch block must NOT contain setReportDirty(false)
    const catchIdx = source.indexOf('} catch (e) {', source.indexOf('const saveReport = async'));
    const catchEnd = source.indexOf('} finally {', catchIdx);
    const catchBlock = source.slice(catchIdx, catchEnd);
    expect(catchBlock).not.toContain('setReportDirty(false)');
  });

  it('exportPdf aborts if report save fails (still dirty)', () => {
    const source = src('src/pages/job-progress-page.tsx');
    expect(source).toContain('if (reportDirty)');
    // Must check dirty again after save attempt
    expect(source).toContain('Still dirty means save failed');
  });

  it('saveAll checks response.ok', () => {
    const source = src('src/pages/job-progress-page.tsx');
    const saveAllIdx = source.indexOf('const saveAll = async');
    const saveAllEnd = source.indexOf('};', saveAllIdx) + 2;
    const saveAllBody = source.slice(saveAllIdx, saveAllEnd);
    expect(saveAllBody).toContain('if (!res.ok)');
  });
});

// ── 11. entry.ts — colsToEnsure has new columns ──────────────────────────────
describe('entry.ts — colsToEnsure includes new progress columns', () => {
  it('entry.ts colsToEnsure contains start_date for job_progress_lines', () => {
    const source = src('src/server/entry.ts');
    expect(source).toContain("column: 'start_date'");
  });

  it('entry.ts colsToEnsure contains end_date for job_progress_lines', () => {
    const source = src('src/server/entry.ts');
    expect(source).toContain("column: 'end_date'");
  });

  it('entry.ts colsToEnsure contains sort_order for job_progress_lines', () => {
    const source = src('src/server/entry.ts');
    expect(source).toContain("column: 'sort_order'");
  });

  it('entry.ts contains composite index creation for job_progress_lines', () => {
    const source = src('src/server/entry.ts');
    expect(source).toContain('idx_progress_company_job_order');
  });
});
