/**
 * PO Gate 1 — Security & Data Hardening
 *
 * Two layers of tests:
 *  1. Source-level structural checks (grep the handler source for required patterns)
 *  2. Runtime handler tests (invoke handlers with mocked db + auth via stubs)
 *
 * Auth is controlled via the vitest-aliased auth.stub.ts → __setMockSession()
 * DB is controlled via the vitest-aliased db-client.stub.ts → __dbExecuteMock / __dbQueryProfilesMock
 *
 * The real po-auth.ts is used (not mocked) — its dependencies are stubbed instead.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { __setMockSession } from '../../test/stubs/auth.stub';
import { __dbExecuteMock, __dbQueryProfilesMock } from '../../test/stubs/db-client.stub';

// ── Source reader ─────────────────────────────────────────────────────────────
function src(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
}

// ── Mock helpers ──────────────────────────────────────────────────────────────
function makeRes() {
  const res = {
    _status: 200,
    _body: undefined as unknown,
    status(code: number) { this._status = code; return this; },
    json(body: unknown) { this._body = body; return this; },
    setHeader() { return this; },
    send(body: unknown) { this._body = body; return this; },
  };
  return res;
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    body: {},
    headers: {},
    ...overrides,
  };
}

// ── Profile factory ───────────────────────────────────────────────────────────
// Builds a DB profile row that po-auth.ts will read from db.query.profiles.findFirst
function makeDbProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 'user-1',
    role: 'owner',
    companyId: 10,
    permInvoices: true,
    permSeeDollars: true,
    permAdmin: false,
    permDeleteRecords: true,
    ...overrides,
  };
}

// ── Source-level structural tests ─────────────────────────────────────────────

describe('PO Gate 1 — Source structure: permission gates', () => {
  const postSrc = src('src/server/api/jobs/[id]/purchase-orders/POST.ts');
  const getSrc  = src('src/server/api/jobs/[id]/purchase-orders/[poId]/GET.ts');
  const putSrc  = src('src/server/api/jobs/[id]/purchase-orders/[poId]/PUT.ts');
  const delSrc  = src('src/server/api/jobs/[id]/purchase-orders/[poId]/DELETE.ts');
  const pdfSrc  = src('src/server/api/jobs/[id]/purchase-orders/[poId]/pdf/GET.ts');
  const poAuthSrc = src('src/server/lib/po-auth.ts');

  it('POST.ts enforces Finance permission (imports requireFinance from po-auth)', () => {
    expect(postSrc).toContain('requireFinance');
    expect(postSrc).toContain('po-auth');
  });

  it('GET.ts enforces Finance permission (imports from po-auth)', () => {
    expect(getSrc).toContain('po-auth');
    expect(getSrc).toContain('requireFinanceAndDollars');
  });

  it('PUT.ts enforces Finance permission (imports from po-auth)', () => {
    expect(putSrc).toContain('po-auth');
    expect(putSrc).toContain('requireFinance');
  });

  it('DELETE.ts enforces Finance permission (imports from po-auth)', () => {
    expect(delSrc).toContain('po-auth');
    expect(delSrc).toContain('requireFinanceAndDelete');
  });

  it('pdf/GET.ts enforces Finance permission (imports from po-auth)', () => {
    expect(pdfSrc).toContain('po-auth');
    expect(pdfSrc).toContain('requireFinanceAndDollars');
  });

  it('po-auth.ts enforces permInvoices for Finance access', () => {
    expect(poAuthSrc).toContain('permInvoices');
    expect(poAuthSrc).toContain('403');
  });

  it('GET.ts enforces permSeeDollars for financial data (via requireFinanceAndDollars)', () => {
    expect(getSrc).toContain('requireFinanceAndDollars');
    expect(poAuthSrc).toContain('permSeeDollars');
  });

  it('pdf/GET.ts enforces permSeeDollars (via requireFinanceAndDollars)', () => {
    expect(pdfSrc).toContain('requireFinanceAndDollars');
  });

  it('DELETE.ts enforces permDeleteRecords or owner/admin (via requireFinanceAndDelete)', () => {
    expect(delSrc).toContain('requireFinanceAndDelete');
    expect(poAuthSrc).toContain('permDeleteRecords');
  });
});

describe('PO Gate 1 — Source structure: job+company binding', () => {
  const getSrc  = src('src/server/api/jobs/[id]/purchase-orders/[poId]/GET.ts');
  const putSrc  = src('src/server/api/jobs/[id]/purchase-orders/[poId]/PUT.ts');
  const delSrc  = src('src/server/api/jobs/[id]/purchase-orders/[poId]/DELETE.ts');
  const pdfSrc  = src('src/server/api/jobs/[id]/purchase-orders/[poId]/pdf/GET.ts');

  it('GET.ts WHERE clause includes job_id', () => {
    expect(getSrc).toMatch(/job_id.*=.*jobId|jobId.*job_id/);
  });

  it('PUT.ts WHERE clause includes job_id', () => {
    expect(putSrc).toMatch(/job_id.*=.*jobId|jobId.*job_id/);
  });

  it('DELETE.ts WHERE clause includes job_id', () => {
    expect(delSrc).toMatch(/job_id.*=.*jobId|jobId.*job_id/);
  });

  it('pdf/GET.ts WHERE clause includes job_id', () => {
    expect(pdfSrc).toMatch(/job_id.*=.*jobId|jobId.*job_id/);
  });
});

describe('PO Gate 1 — Source structure: server-computed totals', () => {
  const postSrc   = src('src/server/api/jobs/[id]/purchase-orders/POST.ts');
  const poAuthSrc = src('src/server/lib/po-auth.ts');

  it('po-auth.ts computes line amount = qty * rate server-side', () => {
    expect(poAuthSrc).toContain('qty * rate');
  });

  it('POST.ts computes subtotal server-side (not from body)', () => {
    expect(postSrc).toContain('subtotal');
    expect(postSrc).not.toContain('body.subtotal');
    expect(postSrc).not.toContain('body.total');
    expect(postSrc).not.toContain('body.gst');
  });

  it('POST.ts does NOT trust body.lines[].amount (uses validateLines from po-auth)', () => {
    expect(postSrc).toContain('validateLines');
    expect(poAuthSrc).toContain('Server-computed');
    expect(poAuthSrc).not.toContain('raw.amount');
  });
});

describe('PO Gate 1 — Source structure: PO numbering', () => {
  const postSrc = src('src/server/api/jobs/[id]/purchase-orders/POST.ts');

  it('POST.ts does NOT use COUNT(*) + 1 for PO number', () => {
    expect(postSrc).not.toContain('COUNT(*) + 1');
    expect(postSrc).not.toContain('cnt + 1');
    expect(postSrc).not.toContain('countRows');
  });

  it('POST.ts uses po_sequences table for numbering', () => {
    expect(postSrc).toContain('po_sequences');
  });

  it('POST.ts handles duplicate PO number with retry', () => {
    expect(postSrc).toContain('retry');
  });
});

describe('PO Gate 1 — Source structure: status transitions', () => {
  const putSrc = src('src/server/api/jobs/[id]/purchase-orders/[poId]/PUT.ts');
  const delSrc = src('src/server/api/jobs/[id]/purchase-orders/[poId]/DELETE.ts');

  it('PUT.ts defines allowed status transitions', () => {
    expect(putSrc).toContain('ALLOWED_TRANSITIONS');
  });

  it('PUT.ts returns 409 or 422 for invalid transitions', () => {
    expect(putSrc).toMatch(/409|422/);
  });

  it('DELETE.ts only allows deletion of draft POs', () => {
    expect(delSrc).toContain("'draft'");
    expect(delSrc).toMatch(/409|422/);
  });
});

describe('PO Gate 1 — Source structure: Document Engine consistency', () => {
  const postSrc = src('src/server/api/jobs/[id]/purchase-orders/POST.ts');
  const putSrc  = src('src/server/api/jobs/[id]/purchase-orders/[poId]/PUT.ts');
  const delSrc  = src('src/server/api/jobs/[id]/purchase-orders/[poId]/DELETE.ts');

  it('POST.ts creates Document record inside transaction (not best-effort after response)', () => {
    const resIdx = postSrc.indexOf('res.status(201)');
    const docIdx = postSrc.indexOf('ensureDocument');
    expect(docIdx).toBeGreaterThan(-1);
    expect(docIdx).toBeLessThan(resIdx === -1 ? Infinity : resIdx);
  });

  it('PUT.ts calls updateDocument on status change', () => {
    expect(putSrc).toContain('updateDocument');
  });

  it('PUT.ts calls logEvent on status change', () => {
    expect(putSrc).toContain('logEvent');
  });

  it('DELETE.ts calls revokeShare to revoke active share links', () => {
    expect(delSrc).toContain('revokeShare');
  });

  it('DELETE.ts updates Document record status on delete', () => {
    expect(delSrc).toContain('updateDocument');
  });

  it('POST.ts uses work_order type for internal assignments', () => {
    expect(postSrc).toContain('work_order');
  });

  it('POST.ts uses purchase_order type for contractor assignments', () => {
    expect(postSrc).toContain('purchase_order');
  });
});

describe('PO Gate 1 — Source structure: Supplier/Contractor validation', () => {
  const postSrc = src('src/server/api/jobs/[id]/purchase-orders/POST.ts');

  it('POST.ts validates contractor belongs to same company', () => {
    expect(postSrc).toContain('record_type');
    expect(postSrc).toContain('contractor');
  });

  it('POST.ts validates progress lines belong to the correct job and company', () => {
    expect(postSrc).toContain('progressLineId');
    expect(postSrc).toMatch(/job_id.*jobId|jobId.*job_id/);
  });
});

describe('PO Gate 1 — Source structure: po_sequences table', () => {
  const entrySrc = src('src/server/entry.ts');

  it('entry.ts registers po_sequences table in ensureTables', () => {
    expect(entrySrc).toContain('po_sequences');
  });

  it('po_sequences has a unique constraint on (company_id, po_number)', () => {
    const idx = entrySrc.indexOf('po_sequences');
    const block = entrySrc.slice(idx, idx + 500);
    expect(block).toContain('UNIQUE');
  });
});

describe('PO Gate 1 — Source structure: input validation', () => {
  const postSrc   = src('src/server/api/jobs/[id]/purchase-orders/POST.ts');
  const poAuthSrc = src('src/server/lib/po-auth.ts');

  it('POST.ts validates line count limit (MAX_LINES)', () => {
    expect(postSrc).toContain('MAX_LINES');
  });

  it('po-auth.ts rejects non-finite or negative monetary values', () => {
    expect(poAuthSrc).toContain('isFinite');
  });

  it('po-auth.ts validates description length', () => {
    expect(poAuthSrc).toContain('description');
    expect(poAuthSrc).toContain('trim()');
  });
});

describe('PO Gate 1 — Source structure: legacy status visibility', () => {
  const getSrc = src('src/server/api/jobs/[id]/purchase-orders/GET.ts');
  const putSrc = src('src/server/api/jobs/[id]/purchase-orders/[poId]/PUT.ts');

  it('GET.ts does NOT filter out paid status from results', () => {
    expect(getSrc).not.toContain("!= 'paid'");
    expect(getSrc).not.toContain('status NOT IN');
  });

  it('PUT.ts ALLOWED_TRANSITIONS includes paid as a readable legacy status', () => {
    const poAuthSrc = src('src/server/lib/po-auth.ts');
    expect(poAuthSrc).toContain("'paid'");
    expect(poAuthSrc).toContain('paid:');
  });
});

// ── Runtime handler tests ─────────────────────────────────────────────────────
//
// Auth is controlled via auth.stub.ts (aliased over src/lib/auth/auth.ts):
//   __setMockSession(null)                    → getSession returns null → 401
//   __setMockSession({ user: { id: 'u1' } }) → getSession returns session
//
// DB profile is controlled via db-client.stub.ts:
//   __dbQueryProfilesMock.mockResolvedValue(profileRow) → profile found
//   __dbQueryProfilesMock.mockResolvedValue(null)       → no profile → 403
//
// DB execute is controlled via:
//   __dbExecuteMock.mockResolvedValue([[row], undefined]) → PO found
//   __dbExecuteMock.mockResolvedValue([[], undefined])    → PO not found → 404

describe('PO Gate 1 — Runtime: 401 for unauthenticated requests', () => {
  beforeEach(() => {
    __setMockSession(null);
    __dbQueryProfilesMock.mockReset();
    __dbQueryProfilesMock.mockResolvedValue(null);
    __dbExecuteMock.mockReset();
    __dbExecuteMock.mockResolvedValue([[], undefined]);
  });

  it('GET /api/jobs/:id/purchase-orders returns 401 when no session', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/GET');
    const req = makeReq({ params: { id: '1' } });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(401);
  });

  it('POST /api/jobs/:id/purchase-orders returns 401 when no session', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/POST');
    const req = makeReq({ params: { id: '1' }, body: {} });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(401);
  });

  it('GET /api/jobs/:id/purchase-orders/:poId returns 401 when no session', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/GET');
    const req = makeReq({ params: { id: '1', poId: '1' } });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(401);
  });

  it('PUT /api/jobs/:id/purchase-orders/:poId returns 401 when no session', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/PUT');
    const req = makeReq({ params: { id: '1', poId: '1' }, body: {} });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(401);
  });

  it('DELETE /api/jobs/:id/purchase-orders/:poId returns 401 when no session', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/DELETE');
    const req = makeReq({ params: { id: '1', poId: '1' } });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(401);
  });
});

describe('PO Gate 1 — Runtime: 403 for missing Finance permission', () => {
  beforeEach(() => {
    __setMockSession({ user: { id: 'user-no-finance' } });
    __dbQueryProfilesMock.mockReset();
    __dbQueryProfilesMock.mockResolvedValue(makeDbProfile({
      userId: 'user-no-finance',
      role: 'staff',
      permInvoices: false,
      permSeeDollars: true,
      permAdmin: false,
      permDeleteRecords: false,
    }));
    __dbExecuteMock.mockReset();
    __dbExecuteMock.mockResolvedValue([[], undefined]);
  });

  it('GET /api/jobs/:id/purchase-orders returns 403 without Finance permission', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/GET');
    const req = makeReq({ params: { id: '1' } });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(403);
  });

  it('POST /api/jobs/:id/purchase-orders returns 403 without Finance permission', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/POST');
    const req = makeReq({ params: { id: '1' }, body: { lines: [] } });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(403);
  });

  it('GET /api/jobs/:id/purchase-orders/:poId returns 403 without Finance permission', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/GET');
    const req = makeReq({ params: { id: '1', poId: '1' } });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(403);
  });

  it('DELETE /api/jobs/:id/purchase-orders/:poId returns 403 without Finance permission', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/DELETE');
    const req = makeReq({ params: { id: '1', poId: '1' } });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(403);
  });
});

describe('PO Gate 1 — Runtime: 403 for missing permSeeDollars', () => {
  beforeEach(() => {
    __setMockSession({ user: { id: 'user-no-dollars' } });
    __dbQueryProfilesMock.mockReset();
    __dbQueryProfilesMock.mockResolvedValue(makeDbProfile({
      userId: 'user-no-dollars',
      role: 'staff',
      permInvoices: true,
      permSeeDollars: false,
      permAdmin: false,
      permDeleteRecords: false,
    }));
    __dbExecuteMock.mockReset();
    __dbExecuteMock.mockResolvedValue([[], undefined]);
  });

  it('GET /api/jobs/:id/purchase-orders/:poId returns 403 without permSeeDollars', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/GET');
    const req = makeReq({ params: { id: '1', poId: '1' } });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(403);
  });

  it('pdf/GET returns 403 without permSeeDollars', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/pdf/GET');
    const req = makeReq({ params: { id: '1', poId: '1' } });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(403);
  });
});

describe('PO Gate 1 — Runtime: 404 for cross-company and wrong-job access', () => {
  beforeEach(() => {
    __setMockSession({ user: { id: 'user-owner' } });
    __dbQueryProfilesMock.mockReset();
    __dbQueryProfilesMock.mockResolvedValue(makeDbProfile({ userId: 'user-owner', role: 'owner' }));
    __dbExecuteMock.mockReset();
    // db.execute returns empty rows — PO not found for this job+company
    __dbExecuteMock.mockResolvedValue([[], undefined]);
  });

  it('GET /:poId returns 404 for cross-company PO', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/GET');
    const req = makeReq({ params: { id: '1', poId: '999' } });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(404);
  });

  it('GET /:poId returns 404 for wrong-job PO (same company)', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/GET');
    const req = makeReq({ params: { id: '1', poId: '5' } });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(404);
  });

  it('PUT /:poId returns 404 for cross-company PO', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/PUT');
    const req = makeReq({ params: { id: '1', poId: '999' }, body: { status: 'sent' } });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(404);
  });

  it('DELETE /:poId returns 404 for cross-company PO', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/DELETE');
    const req = makeReq({ params: { id: '1', poId: '999' } });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(404);
  });
});

describe('PO Gate 1 — Runtime: Draft-only deletion', () => {
  beforeEach(() => {
    __setMockSession({ user: { id: 'user-owner' } });
    __dbQueryProfilesMock.mockReset();
    __dbQueryProfilesMock.mockResolvedValue(makeDbProfile({ userId: 'user-owner', role: 'owner' }));
    __dbExecuteMock.mockReset();
  });

  it('DELETE returns 409 when PO status is sent', async () => {
    __dbExecuteMock.mockResolvedValue([[{ id: 5, status: 'sent', job_id: 1, company_id: 10 }], undefined]);
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/DELETE');
    const req = makeReq({ params: { id: '1', poId: '5' } });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(409);
  });

  it('DELETE returns 409 when PO status is completed', async () => {
    __dbExecuteMock.mockResolvedValue([[{ id: 5, status: 'completed', job_id: 1, company_id: 10 }], undefined]);
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/DELETE');
    const req = makeReq({ params: { id: '1', poId: '5' } });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(409);
  });

  it('DELETE returns 409 when PO status is cancelled', async () => {
    __dbExecuteMock.mockResolvedValue([[{ id: 5, status: 'cancelled', job_id: 1, company_id: 10 }], undefined]);
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/DELETE');
    const req = makeReq({ params: { id: '1', poId: '5' } });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(409);
  });
});

describe('PO Gate 1 — Runtime: Invalid status transitions', () => {
  beforeEach(() => {
    __setMockSession({ user: { id: 'user-owner' } });
    __dbQueryProfilesMock.mockReset();
    __dbQueryProfilesMock.mockResolvedValue(makeDbProfile({ userId: 'user-owner', role: 'owner' }));
    __dbExecuteMock.mockReset();
  });

  it('PUT returns 422 for invalid status value', async () => {
    __dbExecuteMock.mockResolvedValue([[{ id: 5, status: 'draft', job_id: 1, company_id: 10 }], undefined]);
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/PUT');
    const req = makeReq({ params: { id: '1', poId: '5' }, body: { status: 'bogus_status' } });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(422);
  });

  it('PUT returns 409 for disallowed transition (completed → draft)', async () => {
    __dbExecuteMock.mockResolvedValue([[{ id: 5, status: 'completed', job_id: 1, company_id: 10 }], undefined]);
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/PUT');
    const req = makeReq({ params: { id: '1', poId: '5' }, body: { status: 'draft' } });
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(409);
  });
});

describe('PO Gate 1 — Source structure: transaction rollback on line failure', () => {
  const postSrc = src('src/server/api/jobs/[id]/purchase-orders/POST.ts');

  it('POST.ts uses START TRANSACTION / ROLLBACK pattern', () => {
    expect(postSrc).toContain('START TRANSACTION');
    expect(postSrc).toContain('ROLLBACK');
  });

  it('POST.ts commits only after all writes succeed', () => {
    expect(postSrc).toContain('COMMIT');
    const commitIdx = postSrc.lastIndexOf('COMMIT');
    const lineInsertIdx = postSrc.indexOf('INSERT INTO job_purchase_order_lines');
    expect(commitIdx).toBeGreaterThan(lineInsertIdx);
  });
});

describe('PO Gate 1 — Source structure: concurrent unique PO numbers', () => {
  const postSrc = src('src/server/api/jobs/[id]/purchase-orders/POST.ts');

  it('POST.ts uses INSERT INTO po_sequences for atomic increment', () => {
    expect(postSrc).toContain('po_sequences');
    expect(postSrc).toMatch(/ON DUPLICATE KEY|INSERT INTO po_sequences/);
  });

  it('po_sequences table has UNIQUE constraint on (company_id) in entry.ts', () => {
    const entrySrc = src('src/server/entry.ts');
    const idx = entrySrc.indexOf('po_sequences');
    const block = entrySrc.slice(idx, idx + 600);
    expect(block).toContain('UNIQUE');
    expect(block).toContain('company_id');
  });
});

describe('PO Gate 1 — Source structure: legacy paid status readable', () => {
  const listSrc   = src('src/server/api/jobs/[id]/purchase-orders/GET.ts');
  const poAuthSrc = src('src/server/lib/po-auth.ts');

  it('List GET does not exclude paid POs from results', () => {
    expect(listSrc).not.toMatch(/status\s*!=\s*['"]paid['"]/);
    expect(listSrc).not.toMatch(/status\s*NOT\s+IN.*paid/i);
  });

  it('po-auth.ts ALLOWED_TRANSITIONS includes paid as a readable legacy status', () => {
    expect(poAuthSrc).toContain("'paid'");
    expect(poAuthSrc).toContain('paid:');
  });
});
