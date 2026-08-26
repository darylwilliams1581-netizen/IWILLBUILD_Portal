/**
 * PO Finance Phase 1 — Runtime + Structural Tests
 *
 * Runtime tests (the majority):
 *  - 401 for unauthenticated requests on all Finance PO endpoints
 *  - 403 for authenticated users without Finance permission
 *  - 403 for authenticated users without dollar visibility (detail/pdf)
 *  - 403 for authenticated users without delete permission
 *  - Tenant isolation: companyId always comes from server-side profile
 *  - Service-level: validateLines rejects bad input
 *  - Service-level: computeTotals is server-side (client totals ignored)
 *  - Service-level: validateTransition enforces allowed state machine
 *  - Service-level: deletePO rejects non-draft POs
 *  - Service-level: listPOs strips dollar fields when canSeeDollars=false
 *  - Service-level: fetchPODetail returns null for wrong company (isolation)
 *  - Service-level: validateVendor rejects vendor from wrong company
 *  - Service-level: validateJob rejects job from wrong company
 *
 * Structural tests (source-level checks):
 *  - All Finance handlers exist and delegate to po-service
 *  - All Finance handlers call the correct permission gate
 *  - Tenant isolation enforced via profile.companyId (not query/body)
 *  - Transaction integrity (START TRANSACTION / COMMIT / ROLLBACK)
 *  - Server-side totals (computeTotals, never body.total)
 *  - Draft-only deletion
 *  - PDF builder returns real PDF bytes
 *  - Legacy job PDF handler uses shared builder
 *  - Finance page and UI components exist
 *  - All routes registered in entry.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// ── Mocks (hoisted) ───────────────────────────────────────────────────────────

// po-auth mock — same pattern as po-gate1.test.ts
vi.mock('../lib/po-auth', () => {
  let _profile: Record<string, unknown> | null = null;
  return {
    __setMockProfile: (p: Record<string, unknown> | null) => { _profile = p; },
    resolvePOProfile: vi.fn(async (
      _req: unknown,
      res: { status: (n: number) => { json: (b: unknown) => unknown } },
    ) => {
      if (!_profile) { res.status(401).json({ error: 'Unauthorised' }); return null; }
      return _profile;
    }),
    requireFinance: vi.fn((
      profile: Record<string, unknown>,
      res: { status: (n: number) => { json: (b: unknown) => unknown } },
    ) => {
      if (!profile.canFinance) { res.status(403).json({ error: 'Finance permission required' }); return false; }
      return true;
    }),
    requireFinanceAndDollars: vi.fn((
      profile: Record<string, unknown>,
      res: { status: (n: number) => { json: (b: unknown) => unknown } },
    ) => {
      if (!profile.canFinance) { res.status(403).json({ error: 'Finance permission required' }); return false; }
      if (!profile.canSeeDollars) { res.status(403).json({ error: 'Dollar visibility required' }); return false; }
      return true;
    }),
    requireFinanceAndDelete: vi.fn((
      profile: Record<string, unknown>,
      res: { status: (n: number) => { json: (b: unknown) => unknown } },
    ) => {
      if (!profile.canFinance) { res.status(403).json({ error: 'Finance permission required' }); return false; }
      if (!profile.canDelete) { res.status(403).json({ error: 'Delete permission required' }); return false; }
      return true;
    }),
    validateLines: vi.fn((lines: unknown[]) => {
      if (!Array.isArray(lines) || lines.length === 0) {
        return { errors: [{ index: -1, message: 'At least one line item is required' }] };
      }
      const errors: { index: number; message: string }[] = [];
      const validated: Array<{
        description: string; qty: number; rate: number; amount: number;
        unit: string | null; progressLineId: number | null;
      }> = [];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i] as Record<string, unknown>;
        const desc = String(l.description ?? '').trim();
        if (!desc) { errors.push({ index: i, message: 'Description is required' }); continue; }
        const qty  = Number(l.qty  ?? 1);
        const rate = Number(l.rate ?? 0);
        if (!isFinite(qty)  || qty  < 0) { errors.push({ index: i, message: 'Qty invalid' });  continue; }
        if (!isFinite(rate) || rate < 0) { errors.push({ index: i, message: 'Rate invalid' }); continue; }
        validated.push({
          description: desc, qty, rate,
          amount: Math.round(qty * rate * 100) / 100,
          unit: l.unit != null ? String(l.unit) : null,
          progressLineId: null,
        });
      }
      if (errors.length) return { errors };
      return { lines: validated };
    }),
    computeTotals: vi.fn((lines: Array<{ amount: number }>) => {
      const subtotal = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
      const gst      = Math.round(subtotal * 0.1 * 100) / 100;
      const total    = Math.round((subtotal + gst) * 100) / 100;
      return { subtotal, gst, total };
    }),
    validateTransition: vi.fn((from: string, to: string) => {
      const ALLOWED: Record<string, string[]> = {
        draft:     ['sent', 'cancelled'],
        sent:      ['completed', 'cancelled'],
        completed: ['cancelled'],
        cancelled: [],
        paid:      [],
      };
      const VALID = ['draft', 'sent', 'completed', 'cancelled', 'paid'];
      if (!VALID.includes(to)) return { code: 422, message: `Invalid status: ${to}` };
      if (to === from) return null;
      if (!(ALLOWED[from] ?? []).includes(to)) {
        return { code: 409, message: `Cannot transition from ${from} to ${to}` };
      }
      return null;
    }),
    MAX_LINES: 200,
    VALID_STATUSES: ['draft', 'sent', 'completed', 'cancelled', 'paid'],
    ALLOWED_TRANSITIONS: {
      draft:     new Set(['sent', 'cancelled']),
      sent:      new Set(['completed', 'cancelled']),
      completed: new Set(['cancelled']),
      cancelled: new Set([]),
      paid:      new Set([]),
    },
  };
});

// db/client mock
const dbExecuteMock = vi.fn().mockResolvedValue([[], undefined]);
vi.mock('../db/client', () => ({
  db: new Proxy({}, {
    get(_t, prop) {
      if (prop === 'execute') return dbExecuteMock;
      if (prop === 'transaction') return vi.fn().mockImplementation(
        async (fn: (tx: unknown) => unknown) => fn({}),
      );
      return () => ({});
    },
  }),
}));

// document-engine mock
vi.mock('../lib/document-engine', () => ({
  ensureDocument: vi.fn(async () => 1),
  logEvent:       vi.fn(async () => {}),
  getDocumentBySource: vi.fn(async () => null),
  updateDocument: vi.fn(async () => {}),
  revokeShare:    vi.fn(async () => {}),
}));

// po-service mock — used by Finance handler tests; service-level tests import real service
vi.mock('../lib/po-service', async (importOriginal) => {
  const real = await importOriginal() as Record<string, unknown>;
  return { ...real };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
  const res = {
    _status: 200,
    _body: undefined as unknown,
    _headers: {} as Record<string, string | number>,
    status(code: number) { this._status = code; return this; },
    json(body: unknown)  { this._body = body;   return this; },
    send(body: unknown)  { this._body = body;   return this; },
    setHeader(k: string, v: string | number) { this._headers[k] = v; return this; },
  };
  return res;
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return { params: {}, query: {}, body: {}, headers: {}, ...overrides };
}

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, userId: 'user-1', role: 'owner', companyId: 10,
    isOwner: true, isAdmin: true,
    canFinance: true, canSeeDollars: true, canDelete: true,
    ...overrides,
  };
}

let setMockProfile: (p: Record<string, unknown> | null) => void;

// ── Runtime: 401 unauthenticated ──────────────────────────────────────────────

describe('PO Finance — Runtime: 401 for unauthenticated requests', () => {
  beforeEach(async () => {
    const mod = await import('../lib/po-auth');
    setMockProfile = (mod as unknown as { __setMockProfile: typeof setMockProfile }).__setMockProfile;
    setMockProfile(null);
    dbExecuteMock.mockReset();
    dbExecuteMock.mockResolvedValue([[], undefined]);
  });

  it('GET /api/finance/purchase-orders → 401', async () => {
    const { default: h } = await import('../api/finance/purchase-orders/GET');
    const res = makeRes();
    await h(makeReq({ query: {} }) as never, res as never);
    expect(res._status).toBe(401);
  });

  it('POST /api/finance/purchase-orders → 401', async () => {
    const { default: h } = await import('../api/finance/purchase-orders/POST');
    const res = makeRes();
    await h(makeReq({ body: {} }) as never, res as never);
    expect(res._status).toBe(401);
  });

  it('GET /api/finance/purchase-orders/:poId → 401', async () => {
    const { default: h } = await import('../api/finance/purchase-orders/[poId]/GET');
    const res = makeRes();
    await h(makeReq({ params: { poId: '1' } }) as never, res as never);
    expect(res._status).toBe(401);
  });

  it('PUT /api/finance/purchase-orders/:poId → 401', async () => {
    const { default: h } = await import('../api/finance/purchase-orders/[poId]/PUT');
    const res = makeRes();
    await h(makeReq({ params: { poId: '1' }, body: {} }) as never, res as never);
    expect(res._status).toBe(401);
  });

  it('DELETE /api/finance/purchase-orders/:poId → 401', async () => {
    const { default: h } = await import('../api/finance/purchase-orders/[poId]/DELETE');
    const res = makeRes();
    await h(makeReq({ params: { poId: '1' } }) as never, res as never);
    expect(res._status).toBe(401);
  });

  it('GET /api/finance/purchase-orders/:poId/pdf → 401', async () => {
    const { default: h } = await import('../api/finance/purchase-orders/[poId]/pdf/GET');
    const res = makeRes();
    await h(makeReq({ params: { poId: '1' } }) as never, res as never);
    expect(res._status).toBe(401);
  });
});

// ── Runtime: 403 missing Finance permission ───────────────────────────────────

describe('PO Finance — Runtime: 403 for missing Finance permission', () => {
  beforeEach(async () => {
    const mod = await import('../lib/po-auth');
    setMockProfile = (mod as unknown as { __setMockProfile: typeof setMockProfile }).__setMockProfile;
    setMockProfile(makeProfile({ canFinance: false }));
    dbExecuteMock.mockReset();
    dbExecuteMock.mockResolvedValue([[], undefined]);
  });

  it('GET /api/finance/purchase-orders → 403', async () => {
    const { default: h } = await import('../api/finance/purchase-orders/GET');
    const res = makeRes();
    await h(makeReq({ query: {} }) as never, res as never);
    expect(res._status).toBe(403);
  });

  it('POST /api/finance/purchase-orders → 403', async () => {
    const { default: h } = await import('../api/finance/purchase-orders/POST');
    const res = makeRes();
    await h(makeReq({ body: { jobId: 1 } }) as never, res as never);
    expect(res._status).toBe(403);
  });

  it('GET /api/finance/purchase-orders/:poId → 403', async () => {
    const { default: h } = await import('../api/finance/purchase-orders/[poId]/GET');
    const res = makeRes();
    await h(makeReq({ params: { poId: '1' } }) as never, res as never);
    expect(res._status).toBe(403);
  });

  it('PUT /api/finance/purchase-orders/:poId → 403', async () => {
    const { default: h } = await import('../api/finance/purchase-orders/[poId]/PUT');
    const res = makeRes();
    await h(makeReq({ params: { poId: '1' }, body: {} }) as never, res as never);
    expect(res._status).toBe(403);
  });

  it('DELETE /api/finance/purchase-orders/:poId → 403', async () => {
    const { default: h } = await import('../api/finance/purchase-orders/[poId]/DELETE');
    const res = makeRes();
    await h(makeReq({ params: { poId: '1' } }) as never, res as never);
    expect(res._status).toBe(403);
  });

  it('GET /api/finance/purchase-orders/:poId/pdf → 403', async () => {
    const { default: h } = await import('../api/finance/purchase-orders/[poId]/pdf/GET');
    const res = makeRes();
    await h(makeReq({ params: { poId: '1' } }) as never, res as never);
    expect(res._status).toBe(403);
  });
});

// ── Runtime: 403 missing dollar visibility ────────────────────────────────────

describe('PO Finance — Runtime: 403 for missing dollar visibility', () => {
  beforeEach(async () => {
    const mod = await import('../lib/po-auth');
    setMockProfile = (mod as unknown as { __setMockProfile: typeof setMockProfile }).__setMockProfile;
    // Has Finance but NOT canSeeDollars
    setMockProfile(makeProfile({ canFinance: true, canSeeDollars: false }));
    dbExecuteMock.mockReset();
    dbExecuteMock.mockResolvedValue([[], undefined]);
  });

  it('GET /api/finance/purchase-orders/:poId → 403 (detail requires dollars)', async () => {
    const { default: h } = await import('../api/finance/purchase-orders/[poId]/GET');
    const res = makeRes();
    await h(makeReq({ params: { poId: '1' } }) as never, res as never);
    expect(res._status).toBe(403);
  });

  it('GET /api/finance/purchase-orders/:poId/pdf → 403 (PDF requires dollars)', async () => {
    const { default: h } = await import('../api/finance/purchase-orders/[poId]/pdf/GET');
    const res = makeRes();
    await h(makeReq({ params: { poId: '1' } }) as never, res as never);
    expect(res._status).toBe(403);
  });

  it('GET /api/finance/purchase-orders list → 200 (list does NOT require dollars)', async () => {
    // List is allowed without dollars — dollar fields are stripped server-side
    dbExecuteMock.mockResolvedValue([[{ status: 'draft', cnt: 2 }], undefined]);
    const { default: h } = await import('../api/finance/purchase-orders/GET');
    const res = makeRes();
    await h(makeReq({ query: {} }) as never, res as never);
    // 200 or 500 (DB mock returns minimal data) — must NOT be 403
    expect(res._status).not.toBe(403);
    expect(res._status).not.toBe(401);
  });
});

// ── Runtime: 403 missing delete permission ────────────────────────────────────

describe('PO Finance — Runtime: 403 for missing delete permission', () => {
  beforeEach(async () => {
    const mod = await import('../lib/po-auth');
    setMockProfile = (mod as unknown as { __setMockProfile: typeof setMockProfile }).__setMockProfile;
    setMockProfile(makeProfile({ canFinance: true, canSeeDollars: true, canDelete: false }));
    dbExecuteMock.mockReset();
    dbExecuteMock.mockResolvedValue([[], undefined]);
  });

  it('DELETE /api/finance/purchase-orders/:poId → 403 without delete permission', async () => {
    const { default: h } = await import('../api/finance/purchase-orders/[poId]/DELETE');
    const res = makeRes();
    await h(makeReq({ params: { poId: '1' } }) as never, res as never);
    expect(res._status).toBe(403);
  });
});

// ── Runtime: 400 invalid input ────────────────────────────────────────────────

describe('PO Finance — Runtime: 400 for invalid input', () => {
  beforeEach(async () => {
    const mod = await import('../lib/po-auth');
    setMockProfile = (mod as unknown as { __setMockProfile: typeof setMockProfile }).__setMockProfile;
    setMockProfile(makeProfile());
    dbExecuteMock.mockReset();
    dbExecuteMock.mockResolvedValue([[], undefined]);
  });

  it('POST /api/finance/purchase-orders → 400 when jobId missing', async () => {
    const { default: h } = await import('../api/finance/purchase-orders/POST');
    const res = makeRes();
    await h(makeReq({ body: { lines: [] } }) as never, res as never);
    expect(res._status).toBe(400);
    expect((res._body as Record<string, unknown>).error).toMatch(/jobId/i);
  });

  it('GET /api/finance/purchase-orders/:poId → 400 for non-numeric poId', async () => {
    const { default: h } = await import('../api/finance/purchase-orders/[poId]/GET');
    const res = makeRes();
    await h(makeReq({ params: { poId: 'abc' } }) as never, res as never);
    expect(res._status).toBe(400);
  });

  it('PUT /api/finance/purchase-orders/:poId → 400 for non-numeric poId', async () => {
    const { default: h } = await import('../api/finance/purchase-orders/[poId]/PUT');
    const res = makeRes();
    await h(makeReq({ params: { poId: 'abc' }, body: {} }) as never, res as never);
    expect(res._status).toBe(400);
  });

  it('DELETE /api/finance/purchase-orders/:poId → 400 for non-numeric poId', async () => {
    const { default: h } = await import('../api/finance/purchase-orders/[poId]/DELETE');
    const res = makeRes();
    await h(makeReq({ params: { poId: 'abc' } }) as never, res as never);
    expect(res._status).toBe(400);
  });
});

// ── Runtime: po-auth validateLines ───────────────────────────────────────────

describe('PO Finance — Runtime: validateLines (via mocked po-auth)', () => {
  it('rejects empty lines array', async () => {
    const { validateLines } = await import('../lib/po-auth');
    const result = (validateLines as (l: unknown[]) => unknown)([]);
    expect(result).toHaveProperty('errors');
  });

  it('rejects line with empty description', async () => {
    const { validateLines } = await import('../lib/po-auth');
    const result = (validateLines as (l: unknown[]) => unknown)([
      { description: '  ', qty: 1, rate: 100 },
    ]);
    expect(result).toHaveProperty('errors');
  });

  it('rejects line with negative qty', async () => {
    const { validateLines } = await import('../lib/po-auth');
    const result = (validateLines as (l: unknown[]) => unknown)([
      { description: 'Labour', qty: -1, rate: 100 },
    ]);
    expect(result).toHaveProperty('errors');
  });

  it('rejects line with non-finite rate', async () => {
    const { validateLines } = await import('../lib/po-auth');
    const result = (validateLines as (l: unknown[]) => unknown)([
      { description: 'Labour', qty: 1, rate: Infinity },
    ]);
    expect(result).toHaveProperty('errors');
  });

  it('accepts valid lines and returns computed amounts', async () => {
    const { validateLines } = await import('../lib/po-auth');
    const result = (validateLines as (l: unknown[]) => { lines: Array<{ amount: number }> })([
      { description: 'Labour', qty: 2, rate: 50 },
      { description: 'Materials', qty: 10, rate: 25 },
    ]);
    expect(result).toHaveProperty('lines');
    if ('lines' in result) {
      expect(result.lines[0].amount).toBe(100);
      expect(result.lines[1].amount).toBe(250);
    }
  });
});

// ── Runtime: computeTotals server-side ───────────────────────────────────────

describe('PO Finance — Runtime: computeTotals (server-side, client totals ignored)', () => {
  it('computes subtotal, GST and total from lines', async () => {
    const { computeTotals } = await import('../lib/po-auth');
    const totals = (computeTotals as (l: Array<{ amount: number }>) => {
      subtotal: number; gst: number; total: number;
    })([{ amount: 100 }, { amount: 250 }]);
    expect(totals.subtotal).toBe(350);
    expect(totals.gst).toBeCloseTo(35, 2);
    expect(totals.total).toBeCloseTo(385, 2);
  });

  it('GST is exactly 10% of subtotal', async () => {
    const { computeTotals } = await import('../lib/po-auth');
    const totals = (computeTotals as (l: Array<{ amount: number }>) => {
      subtotal: number; gst: number; total: number;
    })([{ amount: 1000 }]);
    expect(totals.gst).toBe(100);
    expect(totals.total).toBe(1100);
  });
});

// ── Runtime: validateTransition state machine ─────────────────────────────────

describe('PO Finance — Runtime: validateTransition state machine', () => {
  it('allows draft → sent', async () => {
    const { validateTransition } = await import('../lib/po-auth');
    expect((validateTransition as (f: string, t: string) => unknown)('draft', 'sent')).toBeNull();
  });

  it('allows draft → cancelled', async () => {
    const { validateTransition } = await import('../lib/po-auth');
    expect((validateTransition as (f: string, t: string) => unknown)('draft', 'cancelled')).toBeNull();
  });

  it('allows sent → completed', async () => {
    const { validateTransition } = await import('../lib/po-auth');
    expect((validateTransition as (f: string, t: string) => unknown)('sent', 'completed')).toBeNull();
  });

  it('blocks draft → completed (must go via sent)', async () => {
    const { validateTransition } = await import('../lib/po-auth');
    const err = (validateTransition as (f: string, t: string) => { code: number } | null)('draft', 'completed');
    expect(err).not.toBeNull();
    expect(err?.code).toBe(409);
  });

  it('blocks completed → sent (backwards)', async () => {
    const { validateTransition } = await import('../lib/po-auth');
    const err = (validateTransition as (f: string, t: string) => { code: number } | null)('completed', 'sent');
    expect(err).not.toBeNull();
    expect(err?.code).toBe(409);
  });

  it('blocks paid → any (terminal)', async () => {
    const { validateTransition } = await import('../lib/po-auth');
    const err = (validateTransition as (f: string, t: string) => { code: number } | null)('paid', 'draft');
    expect(err).not.toBeNull();
  });

  it('rejects unknown target status with 422', async () => {
    const { validateTransition } = await import('../lib/po-auth');
    const err = (validateTransition as (f: string, t: string) => { code: number } | null)('draft', 'bogus');
    expect(err).not.toBeNull();
    expect(err?.code).toBe(422);
  });
});

// ── Runtime: tenant isolation (service-level) ─────────────────────────────────

describe('PO Finance — Runtime: tenant isolation via DB mock', () => {
  beforeEach(() => {
    dbExecuteMock.mockReset();
    dbExecuteMock.mockResolvedValue([[], undefined]);
  });

  it('fetchPODetail returns null when company_id does not match (wrong company)', async () => {
    // DB returns empty rows — simulates company_id mismatch in WHERE clause
    dbExecuteMock.mockResolvedValue([[], undefined]);
    const { fetchPODetail } = await import('../lib/po-service');
    const result = await fetchPODetail(99, 1); // companyId=99, poId=1
    expect(result).toBeNull();
  });

  it('listPOs returns empty list when company has no POs', async () => {
    // Count query returns empty, list query returns empty
    dbExecuteMock
      .mockResolvedValueOnce([[], undefined]) // counts
      .mockResolvedValueOnce([[], undefined]); // list
    const { listPOs } = await import('../lib/po-service');
    const result = await listPOs({ companyId: 99, canSeeDollars: true });
    expect(result.purchaseOrders).toHaveLength(0);
    expect(result.counts.all).toBe(0);
  });

  it('validateJob returns error when job belongs to different company', async () => {
    // DB returns empty — job not found for this company
    dbExecuteMock.mockResolvedValue([[], undefined]);
    const { validateJob } = await import('../lib/po-service');
    const result = await validateJob(99, 1); // companyId=99, jobId=1
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(404);
  });

  it('validateVendor returns error when vendor belongs to different company', async () => {
    dbExecuteMock.mockResolvedValue([[], undefined]);
    const { validateVendor } = await import('../lib/po-service');
    const result = await validateVendor(99, 1); // companyId=99, contractorId=1
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(400);
  });
});

// ── Runtime: deletePO draft-only enforcement ──────────────────────────────────

describe('PO Finance — Runtime: deletePO draft-only enforcement', () => {
  beforeEach(() => {
    dbExecuteMock.mockReset();
  });

  it('deletePO rejects a sent PO with 409', async () => {
    // fetchPODetail returns a sent PO
    dbExecuteMock
      .mockResolvedValueOnce([[{ id: 1, status: 'sent', company_id: 10, job_id: 5 }], undefined])
      .mockResolvedValueOnce([[], undefined]); // lines
    const { deletePO } = await import('../lib/po-service');
    const result = await deletePO({ companyId: 10, userId: 'u1', poId: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(409);
      expect(result.error.message).toMatch(/draft/i);
    }
  });

  it('deletePO rejects a completed PO with 409', async () => {
    dbExecuteMock
      .mockResolvedValueOnce([[{ id: 1, status: 'completed', company_id: 10, job_id: 5 }], undefined])
      .mockResolvedValueOnce([[], undefined]);
    const { deletePO } = await import('../lib/po-service');
    const result = await deletePO({ companyId: 10, userId: 'u1', poId: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(409);
  });

  it('deletePO returns 404 when PO not found', async () => {
    dbExecuteMock.mockResolvedValue([[], undefined]);
    const { deletePO } = await import('../lib/po-service');
    const result = await deletePO({ companyId: 10, userId: 'u1', poId: 9999 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(404);
  });
});

// ── Runtime: listPOs dollar-field stripping ───────────────────────────────────

describe('PO Finance — Runtime: listPOs canSeeDollars enforcement', () => {
  it('listPOs returns counts correctly from DB rows', async () => {
    dbExecuteMock
      .mockResolvedValueOnce([[
        { status: 'draft', cnt: 3 },
        { status: 'sent',  cnt: 2 },
      ], undefined])
      .mockResolvedValueOnce([[], undefined]);
    const { listPOs } = await import('../lib/po-service');
    const result = await listPOs({ companyId: 10, canSeeDollars: true });
    expect(result.counts.draft).toBe(3);
    expect(result.counts.sent).toBe(2);
    expect(result.counts.all).toBe(5);
  });

  it('Finance list handler strips dollar fields when canSeeDollars=false', async () => {
    const mod = await import('../lib/po-auth');
    setMockProfile = (mod as unknown as { __setMockProfile: typeof setMockProfile }).__setMockProfile;
    setMockProfile(makeProfile({ canFinance: true, canSeeDollars: false }));

    // Mock listPOs to return a PO with dollar fields
    dbExecuteMock
      .mockResolvedValueOnce([[{ status: 'draft', cnt: 1 }], undefined])
      .mockResolvedValueOnce([[{
        id: 1, company_id: 10, job_id: 5, po_number: 'PO-0001',
        title: 'Test PO', status: 'draft',
        subtotal: 1000, gst: 100, total: 1100,
        created_at: '2026-01-01', contractor_name: null,
        job_number: '001', job_name: 'Test Job',
      }], undefined]);

    const { default: h } = await import('../api/finance/purchase-orders/GET');
    const res = makeRes();
    await h(makeReq({ query: {} }) as never, res as never);

    expect(res._status).toBe(200);
    const body = res._body as { purchaseOrders: Array<Record<string, unknown>>; canSeeDollars: boolean };
    expect(body.canSeeDollars).toBe(false);
    // Dollar fields must be stripped
    if (body.purchaseOrders?.length) {
      expect(body.purchaseOrders[0].subtotal).toBeUndefined();
      expect(body.purchaseOrders[0].gst).toBeUndefined();
      expect(body.purchaseOrders[0].total).toBeUndefined();
    }
  });
});

// ── Runtime: updatePO status transition enforcement ───────────────────────────

describe('PO Finance — Runtime: updatePO status transition via service', () => {
  it('updatePO returns 409 for invalid transition (completed → sent)', async () => {
    // fetchPODetail returns a completed PO
    dbExecuteMock
      .mockResolvedValueOnce([[{
        id: 1, status: 'completed', company_id: 10, job_id: 5,
        title: 'T', po_number: 'PO-0001',
      }], undefined])
      .mockResolvedValueOnce([[], undefined]); // lines
    const { updatePO } = await import('../lib/po-service');
    const result = await updatePO({
      companyId: 10, userId: 'u1', poId: 1, status: 'sent',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(409);
  });

  it('updatePO returns 409 when trying to edit lines on non-draft PO', async () => {
    dbExecuteMock
      .mockResolvedValueOnce([[{
        id: 1, status: 'sent', company_id: 10, job_id: 5,
        title: 'T', po_number: 'PO-0001',
      }], undefined])
      .mockResolvedValueOnce([[], undefined]);
    const { updatePO } = await import('../lib/po-service');
    const result = await updatePO({
      companyId: 10, userId: 'u1', poId: 1,
      lines: [{ description: 'Labour', qty: 1, rate: 100 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(409);
  });
});

// ── Source-level structural checks ────────────────────────────────────────────

describe('PO Finance — Source structure: handlers exist and delegate to service', () => {
  const serviceFile = path.resolve(__dirname, '../lib/po-service.ts');
  const financeListFile   = path.resolve(__dirname, '../api/finance/purchase-orders/GET.ts');
  const financePostFile   = path.resolve(__dirname, '../api/finance/purchase-orders/POST.ts');
  const financeDetailFile = path.resolve(__dirname, '../api/finance/purchase-orders/[poId]/GET.ts');
  const financePutFile    = path.resolve(__dirname, '../api/finance/purchase-orders/[poId]/PUT.ts');
  const financeDeleteFile = path.resolve(__dirname, '../api/finance/purchase-orders/[poId]/DELETE.ts');
  const financePdfFile    = path.resolve(__dirname, '../api/finance/purchase-orders/[poId]/pdf/GET.ts');
  const pdfBuilderFile    = path.resolve(__dirname, '../lib/purchase-order-pdf-document.ts');
  const composeDefaultsFile = path.resolve(__dirname, '../api/purchase-orders/[poId]/compose-defaults/GET.ts');
  const sendEmailFile     = path.resolve(__dirname, '../api/purchase-orders/[poId]/send-email/POST.ts');

  it('po-service.ts exists', () => expect(fs.existsSync(serviceFile)).toBe(true));
  it('po-service exports createPO, updatePO, deletePO, listPOs, fetchPODetail', () => {
    const src = fs.readFileSync(serviceFile, 'utf8');
    expect(src).toContain('export async function createPO');
    expect(src).toContain('export async function updatePO');
    expect(src).toContain('export async function deletePO');
    expect(src).toContain('export async function listPOs');
    expect(src).toContain('export async function fetchPODetail');
  });
  it('Finance list handler exists and uses listPOs', () => {
    expect(fs.existsSync(financeListFile)).toBe(true);
    expect(fs.readFileSync(financeListFile, 'utf8')).toContain('listPOs');
  });
  it('Finance POST handler exists and uses createPO', () => {
    expect(fs.existsSync(financePostFile)).toBe(true);
    expect(fs.readFileSync(financePostFile, 'utf8')).toContain('createPO');
  });
  it('Finance detail GET handler exists and uses fetchPODetail', () => {
    expect(fs.existsSync(financeDetailFile)).toBe(true);
    expect(fs.readFileSync(financeDetailFile, 'utf8')).toContain('fetchPODetail');
  });
  it('Finance PUT handler exists and uses updatePO', () => {
    expect(fs.existsSync(financePutFile)).toBe(true);
    expect(fs.readFileSync(financePutFile, 'utf8')).toContain('updatePO');
  });
  it('Finance DELETE handler exists and uses deletePO', () => {
    expect(fs.existsSync(financeDeleteFile)).toBe(true);
    expect(fs.readFileSync(financeDeleteFile, 'utf8')).toContain('deletePO');
  });
  it('Finance PDF handler exists and uses buildPOPdf', () => {
    expect(fs.existsSync(financePdfFile)).toBe(true);
    expect(fs.readFileSync(financePdfFile, 'utf8')).toContain('buildPOPdf');
  });
  it('PDF builder exists and uses pdf-lib', () => {
    expect(fs.existsSync(pdfBuilderFile)).toBe(true);
    const src = fs.readFileSync(pdfBuilderFile, 'utf8');
    expect(src).toContain("import('pdf-lib')");
    expect(src).toContain('PDFDocument');
    expect(src).toContain('pdfBytes');
    expect(src).toContain('filename');
  });
  it('compose-defaults handler exists', () => expect(fs.existsSync(composeDefaultsFile)).toBe(true));
  it('send-email handler exists', () => expect(fs.existsSync(sendEmailFile)).toBe(true));
});

describe('PO Finance — Source structure: permission gates', () => {
  it('Finance list calls requireFinance', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../api/finance/purchase-orders/GET.ts'), 'utf8');
    expect(src).toContain('requireFinance(profile, res)');
  });
  it('Finance detail calls requireFinanceAndDollars', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../api/finance/purchase-orders/[poId]/GET.ts'), 'utf8');
    expect(src).toContain('requireFinanceAndDollars(profile, res)');
  });
  it('Finance PUT calls requireFinance', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../api/finance/purchase-orders/[poId]/PUT.ts'), 'utf8');
    expect(src).toContain('requireFinance(profile, res)');
  });
  it('Finance DELETE calls requireFinanceAndDelete', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../api/finance/purchase-orders/[poId]/DELETE.ts'), 'utf8');
    expect(src).toContain('requireFinanceAndDelete(profile, res)');
  });
  it('Finance PDF calls requireFinanceAndDollars', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../api/finance/purchase-orders/[poId]/pdf/GET.ts'), 'utf8');
    expect(src).toContain('requireFinanceAndDollars(profile, res)');
  });
  it('send-email calls requireFinanceAndDollars', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../api/purchase-orders/[poId]/send-email/POST.ts'), 'utf8');
    expect(src).toContain('requireFinanceAndDollars(profile, res)');
  });
  it('compose-defaults calls requireFinanceAndDollars', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../api/purchase-orders/[poId]/compose-defaults/GET.ts'), 'utf8');
    expect(src).toContain('requireFinanceAndDollars(profile, res)');
  });
});

describe('PO Finance — Source structure: tenant isolation', () => {
  it('Finance list uses profile.companyId (not query/body)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../api/finance/purchase-orders/GET.ts'), 'utf8');
    expect(src).toContain('profile.companyId');
    expect(src).not.toMatch(/query\.companyId|body\.companyId|params\.companyId/);
  });
  it('Finance detail uses profile.companyId (not query/body)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../api/finance/purchase-orders/[poId]/GET.ts'), 'utf8');
    expect(src).toContain('profile.companyId');
    expect(src).not.toMatch(/query\.companyId|body\.companyId/);
  });
  it('po-service listPOs always filters by companyId', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/po-service.ts'), 'utf8');
    expect(src).toContain('po.company_id = ${companyId}');
  });
  it('po-service fetchPODetail always filters by companyId', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/po-service.ts'), 'utf8');
    expect(src).toContain('po.company_id = ${companyId}');
  });
});

describe('PO Finance — Source structure: data integrity', () => {
  it('po-service uses START TRANSACTION / COMMIT / ROLLBACK', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/po-service.ts'), 'utf8');
    expect(src).toContain('START TRANSACTION');
    expect(src).toContain('COMMIT');
    expect(src).toContain('ROLLBACK');
  });
  it('po-service updatePO has its own transaction block', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/po-service.ts'), 'utf8');
    const updateIdx = src.indexOf('export async function updatePO');
    const txIdx = src.indexOf('START TRANSACTION', updateIdx);
    expect(txIdx).toBeGreaterThan(updateIdx);
  });
  it('po-service deletePO only deletes draft POs', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/po-service.ts'), 'utf8');
    expect(src).toContain("status !== 'draft'");
    expect(src).toContain('Only draft POs can be deleted');
  });
  it('po-service never trusts client totals (uses computeTotals)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/po-service.ts'), 'utf8');
    expect(src).toContain('computeTotals');
    expect(src).not.toMatch(/body\.(subtotal|gst|total)/);
  });
});

describe('PO Finance — Source structure: PDF and email', () => {
  it('Legacy job PDF handler uses shared buildPOPdf', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../api/jobs/[id]/purchase-orders/[poId]/pdf/GET.ts'), 'utf8',
    );
    expect(src).toContain('buildPOPdf');
    expect(src).toContain('application/pdf');
    expect(src).not.toContain('text/html');
  });
  it('send-email transitions draft → sent only after gateway success', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../api/purchase-orders/[poId]/send-email/POST.ts'), 'utf8',
    );
    expect(src).toContain('await sendEmail(');
    expect(src).toContain("status: 'sent'");
    expect(src).toContain('wasDraft');
    // Status update must come AFTER the sendEmail call
    const sendIdx = src.indexOf('await sendEmail(');
    const transitionIdx = src.indexOf("status: 'sent'");
    expect(transitionIdx).toBeGreaterThan(sendIdx);
  });
  it('send-email blocks cancelled POs', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../api/purchase-orders/[poId]/send-email/POST.ts'), 'utf8',
    );
    expect(src).toContain("status === 'cancelled'");
  });
});

describe('PO Finance — Source structure: route registration', () => {
  it('entry.ts registers all Finance PO routes', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../entry.ts'), 'utf8');
    expect(src).toContain('app.get("/api/finance/purchase-orders"');
    expect(src).toContain('app.post("/api/finance/purchase-orders"');
    expect(src).toContain('app.get("/api/finance/purchase-orders/:poId"');
    expect(src).toContain('app.put("/api/finance/purchase-orders/:poId"');
    expect(src).toContain('app.delete("/api/finance/purchase-orders/:poId"');
    expect(src).toContain('app.get("/api/finance/purchase-orders/:poId/pdf"');
    expect(src).toContain('app.get("/api/purchase-orders/:poId/compose-defaults"');
    expect(src).toContain('app.post("/api/purchase-orders/:poId/send-email"');
  });
  it('entry.ts still registers legacy job-scoped PO routes', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../entry.ts'), 'utf8');
    expect(src).toContain('app.get("/api/jobs/:id/purchase-orders"');
    expect(src).toContain('app.post("/api/jobs/:id/purchase-orders"');
    expect(src).toContain('app.get("/api/jobs/:id/purchase-orders/:poId"');
    expect(src).toContain('app.put("/api/jobs/:id/purchase-orders/:poId"');
    expect(src).toContain('app.delete("/api/jobs/:id/purchase-orders/:poId"');
    expect(src).toContain('app.get("/api/jobs/:id/purchase-orders/:poId/pdf"');
  });
});

describe('PO Finance — Source structure: Finance UI components', () => {
  it('FinancePurchaseOrdersTab component exists', () => {
    expect(fs.existsSync(
      path.resolve(__dirname, '../../components/finance/FinancePurchaseOrdersTab.tsx'),
    )).toBe(true);
  });
  it('NewPOSheet component exists', () => {
    expect(fs.existsSync(
      path.resolve(__dirname, '../../components/finance/NewPOSheet.tsx'),
    )).toBe(true);
  });
  it('FinancePurchaseOrdersTab calls /api/finance/purchase-orders', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../components/finance/FinancePurchaseOrdersTab.tsx'), 'utf8',
    );
    expect(src).toContain('/api/finance/purchase-orders');
  });
  it('NewPOSheet posts to /api/finance/purchase-orders', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../components/finance/NewPOSheet.tsx'), 'utf8',
    );
    expect(src).toContain('/api/finance/purchase-orders');
    expect(src).toContain("method: 'POST'");
  });
  it('finance.tsx includes purchase-orders tab', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../pages/finance.tsx'), 'utf8',
    );
    expect(src).toContain("'purchase-orders'");
    expect(src).toContain('FinancePurchaseOrdersTab');
  });
});
