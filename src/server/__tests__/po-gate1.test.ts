/**
 * PO Gate 1 — Security & Data Hardening
 *
 * Two layers of tests:
 *  1. Source-level structural checks (grep the handler source for required patterns)
 *  2. Runtime handler tests (invoke handlers with mocked db + auth)
 *
 * vi.mock is used to intercept:
 *   - src/server/lib/po-auth.ts  → stub that exposes __setMockProfile()
 *   - src/server/db/client.ts    → stub that exposes __dbExecuteMock
 *
 * vi.mock calls are hoisted to the top of the file by Vitest's transform,
 * so they intercept all dynamic imports inside it() blocks.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// ── Mocks (hoisted — must be declared before any imports that use them) ───────

// Mock po-auth so handlers get a controllable resolvePOProfile
vi.mock('../lib/po-auth', () => {
  let _profile: Record<string, unknown> | null = null;
  return {
    __setMockProfile: (p: Record<string, unknown> | null) => { _profile = p; },
    resolvePOProfile: vi.fn(async (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => unknown } }) => {
      if (!_profile) { res.status(401).json({ error: 'Unauthorised' }); return null; }
      return _profile;
    }),
    requireFinance: vi.fn((profile: Record<string, unknown>, res: { status: (n: number) => { json: (b: unknown) => unknown } }) => {
      if (!profile.canFinance) { res.status(403).json({ error: 'Finance permission required' }); return false; }
      return true;
    }),
    requireFinanceAndDollars: vi.fn((profile: Record<string, unknown>, res: { status: (n: number) => { json: (b: unknown) => unknown } }) => {
      if (!profile.canFinance) { res.status(403).json({ error: 'Finance permission required' }); return false; }
      if (!profile.canSeeDollars) { res.status(403).json({ error: 'Dollar visibility required' }); return false; }
      return true;
    }),
    requireFinanceAndDelete: vi.fn((profile: Record<string, unknown>, res: { status: (n: number) => { json: (b: unknown) => unknown } }) => {
      if (!profile.canFinance) { res.status(403).json({ error: 'Finance permission required' }); return false; }
      if (!profile.canDelete) { res.status(403).json({ error: 'Delete permission required' }); return false; }
      return true;
    }),
    validateLines: vi.fn(() => ({ ok: true, lines: [] })),
    validateTransition: vi.fn((from: string, to: string) => {
      const VALID = ['draft', 'sent', 'completed', 'cancelled', 'paid'];
      if (!VALID.includes(to)) return { ok: false, code: 422, error: `Invalid status: ${to}` };
      const ALLOWED: Record<string, string[]> = {
        draft: ['sent', 'cancelled'],
        sent: ['completed', 'cancelled', 'draft'],
        completed: [],
        cancelled: ['draft'],
        paid: [],
      };
      const allowed = ALLOWED[from] ?? [];
      if (!allowed.includes(to)) return { ok: false, code: 409, error: `Cannot transition from ${from} to ${to}` };
      return { ok: true };
    }),
  };
});

// Mock db/client so handlers never touch MySQL
const dbExecuteMock = vi.fn().mockResolvedValue([[], undefined]);
vi.mock('../db/client', () => {
  function makeChain(): unknown {
    const h: ProxyHandler<object> = {
      get: () => (..._a: unknown[]) => new Proxy({}, h),
      apply: () => new Proxy({}, h),
    };
    return new Proxy({}, h);
  }
  return {
    db: new Proxy({}, {
      get(_t, prop) {
        if (prop === 'execute') return dbExecuteMock;
        if (prop === 'transaction') return vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn({}));
        return (..._a: unknown[]) => makeChain();
      },
    }),
    testConnection: async () => true,
    closeConnection: async () => {},
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function src(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
}

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
  return { params: {}, body: {}, headers: {}, ...overrides };
}

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, userId: 'user-1', role: 'owner', companyId: 10,
    isOwner: true, isAdmin: true, canFinance: true, canSeeDollars: true, canDelete: true,
    ...overrides,
  };
}

// ── Source-level structural tests ─────────────────────────────────────────────

describe('PO Gate 1 — Source structure: permission gates', () => {
  const postSrc   = src('src/server/api/jobs/[id]/purchase-orders/POST.ts');
  const getSrc    = src('src/server/api/jobs/[id]/purchase-orders/[poId]/GET.ts');
  const putSrc    = src('src/server/api/jobs/[id]/purchase-orders/[poId]/PUT.ts');
  const delSrc    = src('src/server/api/jobs/[id]/purchase-orders/[poId]/DELETE.ts');
  const pdfSrc    = src('src/server/api/jobs/[id]/purchase-orders/[poId]/pdf/GET.ts');
  const poAuthSrc = src('src/server/lib/po-auth.ts');

  it('POST.ts enforces Finance permission', () => {
    expect(postSrc).toContain('requireFinance');
    expect(postSrc).toContain('po-auth');
  });
  it('GET.ts enforces Finance + dollar permission', () => {
    expect(getSrc).toContain('po-auth');
    expect(getSrc).toContain('requireFinanceAndDollars');
  });
  it('PUT.ts enforces Finance permission', () => {
    expect(putSrc).toContain('po-auth');
    expect(putSrc).toContain('requireFinance');
  });
  it('DELETE.ts enforces Finance + delete permission', () => {
    expect(delSrc).toContain('po-auth');
    expect(delSrc).toContain('requireFinanceAndDelete');
  });
  it('pdf/GET.ts enforces Finance + dollar permission', () => {
    expect(pdfSrc).toContain('po-auth');
    expect(pdfSrc).toContain('requireFinanceAndDollars');
  });
  it('po-auth.ts enforces permInvoices for Finance access', () => {
    expect(poAuthSrc).toContain('permInvoices');
    expect(poAuthSrc).toContain('403');
  });
  it('po-auth.ts enforces permSeeDollars', () => {
    expect(poAuthSrc).toContain('permSeeDollars');
  });
  it('po-auth.ts enforces permDeleteRecords', () => {
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

  it('po-auth.ts computes line amount server-side', () => {
    expect(poAuthSrc).toContain('qty * rate');
  });
  it('POST.ts computes subtotal server-side', () => {
    expect(postSrc).toContain('subtotal');
    expect(postSrc).not.toContain('body.subtotal');
    expect(postSrc).not.toContain('body.total');
    expect(postSrc).not.toContain('body.gst');
  });
  it('POST.ts uses validateLines from po-auth', () => {
    expect(postSrc).toContain('validateLines');
    expect(poAuthSrc).toContain('Server-computed');
  });
});

describe('PO Gate 1 — Source structure: PO numbering', () => {
  const postSrc = src('src/server/api/jobs/[id]/purchase-orders/POST.ts');

  it('POST.ts does NOT use COUNT(*)+1 for PO number', () => {
    expect(postSrc).not.toContain('COUNT(*) + 1');
    expect(postSrc).not.toContain('cnt + 1');
  });
  it('POST.ts uses po_sequences table', () => {
    expect(postSrc).toContain('po_sequences');
  });
  it('POST.ts handles duplicate PO number with retry', () => {
    expect(postSrc).toContain('retry');
  });
});

describe('PO Gate 1 — Source structure: status transitions', () => {
  const putSrc = src('src/server/api/jobs/[id]/purchase-orders/[poId]/PUT.ts');
  const delSrc = src('src/server/api/jobs/[id]/purchase-orders/[poId]/DELETE.ts');

  it('PUT.ts defines ALLOWED_TRANSITIONS', () => {
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

  it('POST.ts calls ensureDocument inside transaction', () => {
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
  it('DELETE.ts calls revokeShare', () => {
    expect(delSrc).toContain('revokeShare');
  });
  it('DELETE.ts calls updateDocument on delete', () => {
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
  it('POST.ts validates progress lines belong to correct job and company', () => {
    expect(postSrc).toContain('progressLineId');
    expect(postSrc).toMatch(/job_id.*jobId|jobId.*job_id/);
  });
});

describe('PO Gate 1 — Source structure: po_sequences table', () => {
  const entrySrc = src('src/server/entry.ts');

  it('entry.ts registers po_sequences table', () => {
    expect(entrySrc).toContain('po_sequences');
  });
  it('po_sequences has UNIQUE constraint on (company_id, po_number)', () => {
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
  it('po-auth.ts rejects non-finite monetary values', () => {
    expect(poAuthSrc).toContain('isFinite');
  });
  it('po-auth.ts validates description length', () => {
    expect(poAuthSrc).toContain('description');
    expect(poAuthSrc).toContain('trim()');
  });
});

describe('PO Gate 1 — Source structure: legacy status visibility', () => {
  const getSrc    = src('src/server/api/jobs/[id]/purchase-orders/GET.ts');
  const poAuthSrc = src('src/server/lib/po-auth.ts');

  it('GET.ts does NOT filter out paid status', () => {
    expect(getSrc).not.toContain("!= 'paid'");
    expect(getSrc).not.toContain('status NOT IN');
  });
  it('po-auth.ts ALLOWED_TRANSITIONS includes paid as legacy status', () => {
    expect(poAuthSrc).toContain("'paid'");
    expect(poAuthSrc).toContain('paid:');
  });
});

describe('PO Gate 1 — Source structure: transaction rollback', () => {
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

// ── Runtime handler tests ─────────────────────────────────────────────────────
//
// po-auth is mocked via vi.mock('../lib/po-auth') above.
// __setMockProfile controls what resolvePOProfile returns.
// dbExecuteMock controls what db.execute returns.

// Get a reference to the mock's __setMockProfile via the module mock
let setMockProfile: (p: Record<string, unknown> | null) => void;

describe('PO Gate 1 — Runtime: 401 for unauthenticated requests', () => {
  beforeEach(async () => {
    const poAuthMod = await import('../lib/po-auth');
    setMockProfile = (poAuthMod as unknown as { __setMockProfile: typeof setMockProfile }).__setMockProfile;
    setMockProfile(null);
    dbExecuteMock.mockReset();
    dbExecuteMock.mockResolvedValue([[], undefined]);
  });

  it('GET /api/jobs/:id/purchase-orders returns 401 when no session', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/GET');
    const res = makeRes();
    await handler(makeReq({ params: { id: '1' } }) as never, res as never);
    expect(res._status).toBe(401);
  });

  it('POST /api/jobs/:id/purchase-orders returns 401 when no session', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/POST');
    const res = makeRes();
    await handler(makeReq({ params: { id: '1' }, body: {} }) as never, res as never);
    expect(res._status).toBe(401);
  });

  it('GET /api/jobs/:id/purchase-orders/:poId returns 401 when no session', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/GET');
    const res = makeRes();
    await handler(makeReq({ params: { id: '1', poId: '1' } }) as never, res as never);
    expect(res._status).toBe(401);
  });

  it('PUT /api/jobs/:id/purchase-orders/:poId returns 401 when no session', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/PUT');
    const res = makeRes();
    await handler(makeReq({ params: { id: '1', poId: '1' }, body: {} }) as never, res as never);
    expect(res._status).toBe(401);
  });

  it('DELETE /api/jobs/:id/purchase-orders/:poId returns 401 when no session', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/DELETE');
    const res = makeRes();
    await handler(makeReq({ params: { id: '1', poId: '1' } }) as never, res as never);
    expect(res._status).toBe(401);
  });
});

describe('PO Gate 1 — Runtime: 403 for missing Finance permission', () => {
  beforeEach(async () => {
    const poAuthMod = await import('../lib/po-auth');
    setMockProfile = (poAuthMod as unknown as { __setMockProfile: typeof setMockProfile }).__setMockProfile;
    setMockProfile(makeProfile({ canFinance: false }));
    dbExecuteMock.mockReset();
    dbExecuteMock.mockResolvedValue([[], undefined]);
  });

  it('GET /api/jobs/:id/purchase-orders returns 403 without Finance permission', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/GET');
    const res = makeRes();
    await handler(makeReq({ params: { id: '1' } }) as never, res as never);
    expect(res._status).toBe(403);
  });

  it('POST /api/jobs/:id/purchase-orders returns 403 without Finance permission', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/POST');
    const res = makeRes();
    await handler(makeReq({ params: { id: '1' }, body: { lines: [] } }) as never, res as never);
    expect(res._status).toBe(403);
  });

  it('GET /api/jobs/:id/purchase-orders/:poId returns 403 without Finance permission', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/GET');
    const res = makeRes();
    await handler(makeReq({ params: { id: '1', poId: '1' } }) as never, res as never);
    expect(res._status).toBe(403);
  });

  it('DELETE /api/jobs/:id/purchase-orders/:poId returns 403 without Finance permission', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/DELETE');
    const res = makeRes();
    await handler(makeReq({ params: { id: '1', poId: '1' } }) as never, res as never);
    expect(res._status).toBe(403);
  });
});

describe('PO Gate 1 — Runtime: 403 for missing permSeeDollars', () => {
  beforeEach(async () => {
    const poAuthMod = await import('../lib/po-auth');
    setMockProfile = (poAuthMod as unknown as { __setMockProfile: typeof setMockProfile }).__setMockProfile;
    setMockProfile(makeProfile({ canSeeDollars: false }));
    dbExecuteMock.mockReset();
    dbExecuteMock.mockResolvedValue([[], undefined]);
  });

  it('GET /api/jobs/:id/purchase-orders/:poId returns 403 without permSeeDollars', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/GET');
    const res = makeRes();
    await handler(makeReq({ params: { id: '1', poId: '1' } }) as never, res as never);
    expect(res._status).toBe(403);
  });

  it('pdf/GET returns 403 without permSeeDollars', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/pdf/GET');
    const res = makeRes();
    await handler(makeReq({ params: { id: '1', poId: '1' } }) as never, res as never);
    expect(res._status).toBe(403);
  });
});

describe('PO Gate 1 — Runtime: 404 for cross-company and wrong-job access', () => {
  beforeEach(async () => {
    const poAuthMod = await import('../lib/po-auth');
    setMockProfile = (poAuthMod as unknown as { __setMockProfile: typeof setMockProfile }).__setMockProfile;
    setMockProfile(makeProfile());
    dbExecuteMock.mockReset();
    dbExecuteMock.mockResolvedValue([[], undefined]); // PO not found
  });

  it('GET /:poId returns 404 for cross-company PO', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/GET');
    const res = makeRes();
    await handler(makeReq({ params: { id: '1', poId: '999' } }) as never, res as never);
    expect(res._status).toBe(404);
  });

  it('GET /:poId returns 404 for wrong-job PO (same company)', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/GET');
    const res = makeRes();
    await handler(makeReq({ params: { id: '1', poId: '5' } }) as never, res as never);
    expect(res._status).toBe(404);
  });

  it('PUT /:poId returns 404 for cross-company PO', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/PUT');
    const res = makeRes();
    await handler(makeReq({ params: { id: '1', poId: '999' }, body: { status: 'sent' } }) as never, res as never);
    expect(res._status).toBe(404);
  });

  it('DELETE /:poId returns 404 for cross-company PO', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/DELETE');
    const res = makeRes();
    await handler(makeReq({ params: { id: '1', poId: '999' } }) as never, res as never);
    expect(res._status).toBe(404);
  });
});

describe('PO Gate 1 — Runtime: Draft-only deletion', () => {
  beforeEach(async () => {
    const poAuthMod = await import('../lib/po-auth');
    setMockProfile = (poAuthMod as unknown as { __setMockProfile: typeof setMockProfile }).__setMockProfile;
    setMockProfile(makeProfile());
    dbExecuteMock.mockReset();
  });

  it('DELETE returns 409 when PO status is sent', async () => {
    dbExecuteMock.mockResolvedValue([[{ id: 5, status: 'sent', job_id: 1, company_id: 10 }], undefined]);
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/DELETE');
    const res = makeRes();
    await handler(makeReq({ params: { id: '1', poId: '5' } }) as never, res as never);
    expect(res._status).toBe(409);
  });

  it('DELETE returns 409 when PO status is completed', async () => {
    dbExecuteMock.mockResolvedValue([[{ id: 5, status: 'completed', job_id: 1, company_id: 10 }], undefined]);
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/DELETE');
    const res = makeRes();
    await handler(makeReq({ params: { id: '1', poId: '5' } }) as never, res as never);
    expect(res._status).toBe(409);
  });

  it('DELETE returns 409 when PO status is cancelled', async () => {
    dbExecuteMock.mockResolvedValue([[{ id: 5, status: 'cancelled', job_id: 1, company_id: 10 }], undefined]);
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/DELETE');
    const res = makeRes();
    await handler(makeReq({ params: { id: '1', poId: '5' } }) as never, res as never);
    expect(res._status).toBe(409);
  });
});

describe('PO Gate 1 — Runtime: Invalid status transitions', () => {
  beforeEach(async () => {
    const poAuthMod = await import('../lib/po-auth');
    setMockProfile = (poAuthMod as unknown as { __setMockProfile: typeof setMockProfile }).__setMockProfile;
    setMockProfile(makeProfile());
    dbExecuteMock.mockReset();
  });

  it('PUT returns 422 for invalid status value', async () => {
    dbExecuteMock.mockResolvedValue([[{ id: 5, status: 'draft', job_id: 1, company_id: 10 }], undefined]);
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/PUT');
    const res = makeRes();
    await handler(makeReq({ params: { id: '1', poId: '5' }, body: { status: 'bogus_status' } }) as never, res as never);
    expect(res._status).toBe(422);
  });

  it('PUT returns 409 for disallowed transition (completed → draft)', async () => {
    dbExecuteMock.mockResolvedValue([[{ id: 5, status: 'completed', job_id: 1, company_id: 10 }], undefined]);
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/PUT');
    const res = makeRes();
    await handler(makeReq({ params: { id: '1', poId: '5' }, body: { status: 'draft' } }) as never, res as never);
    expect(res._status).toBe(409);
  });
});

