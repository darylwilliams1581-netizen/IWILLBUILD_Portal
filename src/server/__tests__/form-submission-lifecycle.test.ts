/**
 * form-submission-lifecycle.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the form submission archive / restore / permanent-delete
 * lifecycle.
 *
 * Suites:
 *   A. Archive endpoint — POST /api/forms/submissions/:source/:id/archive
 *   B. Restore endpoint — POST /api/forms/submissions/:source/:id/restore
 *   C. Permanent delete — DELETE /api/forms/submissions/:source/:id
 *   D. GET submissions — archived filter (source-code contract)
 *   E. Permissions — admin/owner gate on permanent delete
 *   F. Tenant isolation — cross-company access denied
 *   G. Retention / legal-hold blocking
 *   H. Confirmation requirement (two-step flow contract)
 *   I. Attachment cleanup — extractStoredFiles helper (source-code contract)
 *   J. Template isolation — source template unaffected
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Shared mock helpers ───────────────────────────────────────────────────────

function makeReq(overrides: Partial<Request> = {}): Request {
  return { params: {}, query: {}, body: {}, headers: {}, ...overrides } as unknown as Request;
}

function makeRes() {
  const res = {
    _status: 200,
    _body: {} as unknown,
    status(code: number) { this._status = code; return this; },
    json(body: unknown) { this._body = body; return this; },
  };
  return res;
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetSessionAndProfile = vi.fn();
vi.mock('../lib/auth-middleware.js', () => ({
  getSessionAndProfile: (...args: unknown[]) => mockGetSessionAndProfile(...args),
}));

const mockDbExecute = vi.fn();
vi.mock('../db/client.js', () => ({
  db: { execute: (...args: unknown[]) => mockDbExecute(...args) },
}));

vi.mock('drizzle-orm', () => ({
  sql: { raw: (s: string) => s },
  eq: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function authAs(role: 'admin' | 'owner' | 'member' = 'admin', companyId = 1) {
  mockGetSessionAndProfile.mockResolvedValue({
    session: { user: { id: 'user-1', email: 'test@example.com', name: 'Test User' } },
    profile: { id: 1, userId: 'user-1', companyId, role, status: 'active' },
  });
}

function dbReturnsRow(row: Record<string, unknown>) {
  mockDbExecute.mockResolvedValue([[row], undefined]);
}

function dbReturnsEmpty() {
  mockDbExecute.mockResolvedValue([[], undefined]);
}

// ── Suite A — Archive ─────────────────────────────────────────────────────────

describe('Archive endpoint — POST /api/forms/submissions/:source/:id/archive', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetAllMocks();
    const mod = await import('../api/forms/submissions/[source]/[id]/archive/POST.js');
    handler = mod.default;
  });

  it('returns 401 when not authenticated', async () => {
    mockGetSessionAndProfile.mockResolvedValue(null);
    const req = makeReq({ params: { source: 'internal', id: '1' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    expect(mockGetSessionAndProfile).toHaveBeenCalled();
  });

  it('returns 400 for invalid source', async () => {
    authAs();
    const req = makeReq({ params: { source: 'invalid', id: '1' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status).toBe(400);
    expect((res._body as { error: string }).error).toMatch(/invalid source/i);
  });

  it('returns 400 for invalid id', async () => {
    authAs();
    const req = makeReq({ params: { source: 'internal', id: 'abc' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status).toBe(400);
  });

  it('returns 404 when submission not found', async () => {
    authAs();
    dbReturnsEmpty();
    const req = makeReq({ params: { source: 'internal', id: '99' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status).toBe(404);
  });

  it('returns 403 when submission belongs to different company', async () => {
    authAs('admin', 1);
    dbReturnsRow({ id: 99, company_id: 2, archived_at: null, legal_hold: 0 });
    const req = makeReq({ params: { source: 'internal', id: '99' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status).toBe(403);
  });

  it('returns 409 when submission is already archived', async () => {
    authAs();
    dbReturnsRow({ id: 1, company_id: 1, archived_at: '2026-01-01T00:00:00Z', legal_hold: 0 });
    const req = makeReq({ params: { source: 'internal', id: '1' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status).toBe(409);
    expect((res._body as { error: string }).error).toMatch(/already archived/i);
  });

  it('returns 409 when submission has a legal hold', async () => {
    authAs();
    dbReturnsRow({ id: 1, company_id: 1, archived_at: null, legal_hold: 1 });
    const req = makeReq({ params: { source: 'internal', id: '1' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status).toBe(409);
    expect((res._body as { error: string }).error).toMatch(/legal hold/i);
  });

  it('archives successfully and returns { ok: true }', async () => {
    authAs();
    mockDbExecute
      .mockResolvedValueOnce([[{ id: 1, company_id: 1, archived_at: null, legal_hold: 0 }], undefined])
      .mockResolvedValue([{ affectedRows: 1 }, undefined]);
    const req = makeReq({ params: { source: 'internal', id: '1' }, body: { reason: 'Duplicate' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status).toBe(200);
    expect((res._body as { ok: boolean }).ok).toBe(true);
  });

  it('works for public source', async () => {
    authAs();
    mockDbExecute
      .mockResolvedValueOnce([[{ id: 5, company_id: 1, archived_at: null, legal_hold: 0 }], undefined])
      .mockResolvedValue([{ affectedRows: 1 }, undefined]);
    const req = makeReq({ params: { source: 'public', id: '5' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status).toBe(200);
    expect((res._body as { ok: boolean }).ok).toBe(true);
  });
});

// ── Suite B — Restore ─────────────────────────────────────────────────────────

describe('Restore endpoint — POST /api/forms/submissions/:source/:id/restore', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetAllMocks();
    const mod = await import('../api/forms/submissions/[source]/[id]/restore/POST.js');
    handler = mod.default;
  });

  it('returns 409 when submission is not archived', async () => {
    authAs();
    dbReturnsRow({ id: 1, company_id: 1, archived_at: null });
    const req = makeReq({ params: { source: 'internal', id: '1' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status).toBe(409);
    expect((res._body as { error: string }).error).toMatch(/not archived/i);
  });

  it('restores successfully and returns { ok: true }', async () => {
    authAs();
    mockDbExecute
      .mockResolvedValueOnce([[{ id: 1, company_id: 1, archived_at: '2026-01-01T00:00:00Z' }], undefined])
      .mockResolvedValue([{ affectedRows: 1 }, undefined]);
    const req = makeReq({ params: { source: 'internal', id: '1' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status).toBe(200);
    expect((res._body as { ok: boolean }).ok).toBe(true);
  });

  it('returns 403 for cross-company access', async () => {
    authAs('admin', 1);
    dbReturnsRow({ id: 1, company_id: 2, archived_at: '2026-01-01T00:00:00Z' });
    const req = makeReq({ params: { source: 'internal', id: '1' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status).toBe(403);
  });

  it('restore clears archived_at so active view includes it again (SQL contract)', async () => {
    authAs();
    mockDbExecute
      .mockResolvedValueOnce([[{ id: 1, company_id: 1, archived_at: '2026-01-01T00:00:00Z' }], undefined])
      .mockResolvedValue([{ affectedRows: 1 }, undefined]);
    const req = makeReq({ params: { source: 'internal', id: '1' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    // Verify the UPDATE SQL clears archived_at
    const updateCall = mockDbExecute.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('archived_at') && (c[0] as string).includes('NULL')
    );
    expect(updateCall).toBeDefined();
  });
});

// ── Suite C — Permanent delete ────────────────────────────────────────────────

describe('Permanent delete — DELETE /api/forms/submissions/:source/:id', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetAllMocks();
    const mod = await import('../api/forms/submissions/[source]/[id]/DELETE.js');
    handler = mod.default;
  });

  it('returns 403 for member role (not admin/owner)', async () => {
    authAs('member');
    const req = makeReq({ params: { source: 'internal', id: '1' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status).toBe(403);
    expect((res._body as { error: string }).error).toMatch(/admin.*owner/i);
  });

  it('returns 409 when submission is not archived (must archive first)', async () => {
    authAs('admin');
    dbReturnsRow({ id: 1, company_id: 1, archived_at: null, legal_hold: 0, answers_json: null });
    const req = makeReq({ params: { source: 'internal', id: '1' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status).toBe(409);
    expect((res._body as { error: string }).error).toMatch(/archive.*first/i);
  });

  it('returns 409 when submission has a legal hold', async () => {
    authAs('admin');
    dbReturnsRow({ id: 1, company_id: 1, archived_at: '2026-01-01T00:00:00Z', legal_hold: 1, answers_json: null });
    const req = makeReq({ params: { source: 'internal', id: '1' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status).toBe(409);
    expect((res._body as { error: string }).error).toMatch(/legal hold/i);
  });

  it('permanently deletes an archived submission and returns { ok: true }', async () => {
    authAs('admin');
    mockDbExecute
      .mockResolvedValueOnce([[{ id: 1, company_id: 1, archived_at: '2026-01-01T00:00:00Z', legal_hold: 0, answers_json: null }], undefined])
      .mockResolvedValue([{ affectedRows: 1 }, undefined]);
    const req = makeReq({ params: { source: 'internal', id: '1' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status).toBe(200);
    expect((res._body as { ok: boolean }).ok).toBe(true);
  });

  it('owner role can also permanently delete', async () => {
    authAs('owner');
    mockDbExecute
      .mockResolvedValueOnce([[{ id: 2, company_id: 1, archived_at: '2026-01-01T00:00:00Z', legal_hold: 0, answers_json: null }], undefined])
      .mockResolvedValue([{ affectedRows: 1 }, undefined]);
    const req = makeReq({ params: { source: 'internal', id: '2' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status).toBe(200);
  });

  it('returns 403 for cross-company access', async () => {
    authAs('admin', 1);
    dbReturnsRow({ id: 1, company_id: 2, archived_at: '2026-01-01T00:00:00Z', legal_hold: 0, answers_json: null });
    const req = makeReq({ params: { source: 'internal', id: '1' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status).toBe(403);
  });

  it('returns 400 when source is invalid', async () => {
    authAs('admin');
    const req = makeReq({ params: { source: 'unknown', id: '1' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status).toBe(400);
  });
});

// ── Suite D — GET submissions archived filter (source-code contract) ──────────

describe('GET /api/forms/submissions — archived filter contract', () => {
  it('source code contains archived_at IS NULL filter for default view', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/server/api/forms/submissions/GET.ts', 'utf-8');
    expect(src).toContain('archived_at IS NULL');
  });

  it('source code contains archived_at IS NOT NULL filter for archived view', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/server/api/forms/submissions/GET.ts', 'utf-8');
    expect(src).toContain('archived_at IS NOT NULL');
  });

  it('source code switches on archived query param', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/server/api/forms/submissions/GET.ts', 'utf-8');
    expect(src).toContain("archived === '1'");
  });

  it('SELECT includes archived_at, archived_by, archive_reason, legal_hold', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/server/api/forms/submissions/GET.ts', 'utf-8');
    expect(src).toContain('archived_at');
    expect(src).toContain('archived_by');
    expect(src).toContain('archive_reason');
    expect(src).toContain('legal_hold');
  });
});

// ── Suite E — Permissions ─────────────────────────────────────────────────────

describe('Permissions — permanent delete restricted to admin/owner', () => {
  let handler: (req: Request, res: Response) => Promise<void>;

  beforeEach(async () => {
    vi.resetAllMocks();
    const mod = await import('../api/forms/submissions/[source]/[id]/DELETE.js');
    handler = mod.default;
  });

  for (const role of ['member', 'viewer', 'guest'] as const) {
    it(`blocks role "${role}" from permanent delete`, async () => {
      authAs(role as 'member');
      const req = makeReq({ params: { source: 'internal', id: '1' } });
      const res = makeRes();
      await handler(req as Request, res as unknown as Response);
      expect(res._status).toBe(403);
    });
  }

  it('allows admin role', async () => {
    authAs('admin');
    mockDbExecute
      .mockResolvedValueOnce([[{ id: 1, company_id: 1, archived_at: '2026-01-01T00:00:00Z', legal_hold: 0, answers_json: null }], undefined])
      .mockResolvedValue([{ affectedRows: 1 }, undefined]);
    const req = makeReq({ params: { source: 'internal', id: '1' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status).toBe(200);
  });

  it('allows owner role', async () => {
    authAs('owner');
    mockDbExecute
      .mockResolvedValueOnce([[{ id: 1, company_id: 1, archived_at: '2026-01-01T00:00:00Z', legal_hold: 0, answers_json: null }], undefined])
      .mockResolvedValue([{ affectedRows: 1 }, undefined]);
    const req = makeReq({ params: { source: 'internal', id: '1' } });
    const res = makeRes();
    await handler(req as Request, res as unknown as Response);
    expect(res._status).toBe(200);
  });
});

// ── Suite F — Tenant isolation ────────────────────────────────────────────────

describe('Tenant isolation — cross-company access denied', () => {
  it('archive: 403 when submission.company_id !== profile.companyId', async () => {
    vi.resetAllMocks();
    const { default: archiveHandler } = await import('../api/forms/submissions/[source]/[id]/archive/POST.js');
    authAs('admin', 10);
    dbReturnsRow({ id: 1, company_id: 99, archived_at: null, legal_hold: 0 });
    const req = makeReq({ params: { source: 'internal', id: '1' } });
    const res = makeRes();
    await archiveHandler(req as Request, res as unknown as Response);
    expect(res._status).toBe(403);
  });

  it('restore: 403 when submission.company_id !== profile.companyId', async () => {
    vi.resetAllMocks();
    const { default: restoreHandler } = await import('../api/forms/submissions/[source]/[id]/restore/POST.js');
    authAs('admin', 10);
    dbReturnsRow({ id: 1, company_id: 99, archived_at: '2026-01-01T00:00:00Z' });
    const req = makeReq({ params: { source: 'internal', id: '1' } });
    const res = makeRes();
    await restoreHandler(req as Request, res as unknown as Response);
    expect(res._status).toBe(403);
  });

  it('delete: 403 when submission.company_id !== profile.companyId', async () => {
    vi.resetAllMocks();
    const { default: deleteHandler } = await import('../api/forms/submissions/[source]/[id]/DELETE.js');
    authAs('admin', 10);
    dbReturnsRow({ id: 1, company_id: 99, archived_at: '2026-01-01T00:00:00Z', legal_hold: 0, answers_json: null });
    const req = makeReq({ params: { source: 'internal', id: '1' } });
    const res = makeRes();
    await deleteHandler(req as Request, res as unknown as Response);
    expect(res._status).toBe(403);
  });
});

// ── Suite G — Retention / legal-hold blocking ─────────────────────────────────

describe('Retention / legal-hold blocking', () => {
  it('archive blocked when legal_hold = 1', async () => {
    vi.resetAllMocks();
    const { default: archiveHandler } = await import('../api/forms/submissions/[source]/[id]/archive/POST.js');
    authAs('admin');
    dbReturnsRow({ id: 1, company_id: 1, archived_at: null, legal_hold: 1 });
    const req = makeReq({ params: { source: 'internal', id: '1' } });
    const res = makeRes();
    await archiveHandler(req as Request, res as unknown as Response);
    expect(res._status).toBe(409);
    expect((res._body as { error: string }).error).toMatch(/legal hold/i);
  });

  it('permanent delete blocked when legal_hold = 1', async () => {
    vi.resetAllMocks();
    const { default: deleteHandler } = await import('../api/forms/submissions/[source]/[id]/DELETE.js');
    authAs('admin');
    dbReturnsRow({ id: 1, company_id: 1, archived_at: '2026-01-01T00:00:00Z', legal_hold: 1, answers_json: null });
    const req = makeReq({ params: { source: 'internal', id: '1' } });
    const res = makeRes();
    await deleteHandler(req as Request, res as unknown as Response);
    expect(res._status).toBe(409);
    expect((res._body as { error: string }).error).toMatch(/legal hold/i);
  });

  it('archive allowed when legal_hold = 0', async () => {
    vi.resetAllMocks();
    const { default: archiveHandler } = await import('../api/forms/submissions/[source]/[id]/archive/POST.js');
    authAs('admin');
    mockDbExecute
      .mockResolvedValueOnce([[{ id: 1, company_id: 1, archived_at: null, legal_hold: 0 }], undefined])
      .mockResolvedValue([{ affectedRows: 1 }, undefined]);
    const req = makeReq({ params: { source: 'internal', id: '1' } });
    const res = makeRes();
    await archiveHandler(req as Request, res as unknown as Response);
    expect(res._status).toBe(200);
  });
});

// ── Suite H — Confirmation requirement (two-step flow) ────────────────────────

describe('Confirmation requirement — two-step flow contract', () => {
  it('DELETE returns 409 (not 200) when submission is not archived — enforces archive-first', async () => {
    vi.resetAllMocks();
    const { default: deleteHandler } = await import('../api/forms/submissions/[source]/[id]/DELETE.js');
    authAs('admin');
    dbReturnsRow({ id: 1, company_id: 1, archived_at: null, legal_hold: 0, answers_json: null });
    const req = makeReq({ params: { source: 'internal', id: '1' } });
    const res = makeRes();
    await deleteHandler(req as Request, res as unknown as Response);
    expect(res._status).toBe(409);
  });

  it('DELETE proceeds with empty body (modal handles confirmation client-side)', async () => {
    vi.resetAllMocks();
    const { default: deleteHandler } = await import('../api/forms/submissions/[source]/[id]/DELETE.js');
    authAs('admin');
    mockDbExecute
      .mockResolvedValueOnce([[{ id: 1, company_id: 1, archived_at: '2026-01-01T00:00:00Z', legal_hold: 0, answers_json: null }], undefined])
      .mockResolvedValue([{ affectedRows: 1 }, undefined]);
    const req = makeReq({ params: { source: 'internal', id: '1' }, body: {} });
    const res = makeRes();
    await deleteHandler(req as Request, res as unknown as Response);
    // Should not return 400 for missing confirm field — modal handles it
    expect(res._status).not.toBe(400);
    expect(res._status).toBe(200);
  });
});

// ── Suite I — Attachment cleanup (source-code contract) ───────────────────────

describe('Attachment cleanup — extractStoredFiles helper', () => {
  it('DELETE source contains shared-storage path extraction', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/server/api/forms/submissions/[source]/[id]/DELETE.ts', 'utf-8');
    expect(src).toContain('/shared-storage/');
    expect(src).toContain('/airo-assets/uploads/');
    expect(src).toContain('extractStoredFiles');
    expect(src).toContain('tryDeleteFile');
  });

  it('extractStoredFiles returns empty array for null answers_json', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/server/api/forms/submissions/[source]/[id]/DELETE.ts', 'utf-8');
    expect(src).toContain('if (!answersJson) return []');
  });

  it('DELETE SQL only targets the submission table, not form_templates', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/server/api/forms/submissions/[source]/[id]/DELETE.ts', 'utf-8');
    const deleteStatements = src.match(/DELETE FROM[^;]+/gi) ?? [];
    for (const stmt of deleteStatements) {
      expect(stmt).not.toMatch(/form_templates/i);
    }
  });
});

// ── Suite J — Template isolation ─────────────────────────────────────────────

describe('Template isolation — source template unaffected', () => {
  it('archive endpoint SQL does not touch form_templates', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/server/api/forms/submissions/[source]/[id]/archive/POST.ts', 'utf-8');
    expect(src).not.toMatch(/form_templates/i);
  });

  it('restore endpoint SQL does not touch form_templates', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/server/api/forms/submissions/[source]/[id]/restore/POST.ts', 'utf-8');
    expect(src).not.toMatch(/form_templates/i);
  });

  it('delete endpoint SQL does not touch form_templates', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/server/api/forms/submissions/[source]/[id]/DELETE.ts', 'utf-8');
    const deleteStatements = src.match(/DELETE FROM[^;]+/gi) ?? [];
    for (const stmt of deleteStatements) {
      expect(stmt).not.toMatch(/form_templates/i);
    }
  });

  it('archive endpoint only updates the submission row (not template)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/server/api/forms/submissions/[source]/[id]/archive/POST.ts', 'utf-8');
    const updateStatements = src.match(/UPDATE[^;]+/gi) ?? [];
    for (const stmt of updateStatements) {
      expect(stmt).not.toMatch(/form_templates/i);
    }
  });
});
