import fs from 'fs';
const lines = fs.readFileSync('src/server/__tests__/po-gate1.test.ts', 'utf8').split('\n');

const newRuntime = `
describe('PO Gate 1 — Runtime: 404 for cross-company and wrong-job access', () => {
  beforeEach(() => {
    mockPoAuthProfile.value = {
      id: 1, userId: 'user-company-a', role: 'owner', companyId: 10,
      isOwner: true, isAdmin: true, canFinance: true, canSeeDollars: true, canDelete: true,
    };
    mockDbExecuteForRuntime.fn.mockReset();
    mockDbExecuteForRuntime.fn.mockImplementation(() => Promise.resolve([[], undefined]));
  });

  it('GET /:poId returns 404 for cross-company PO', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/GET');
    const req = makeReq({ params: { id: '1', poId: '999' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(404);
  });

  it('GET /:poId returns 404 for wrong-job PO (same company)', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/GET');
    const req = makeReq({ params: { id: '1', poId: '5' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(404);
  });

  it('PUT /:poId returns 404 for cross-company PO', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/PUT');
    const req = makeReq({ params: { id: '1', poId: '999' }, body: { status: 'sent' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(404);
  });

  it('DELETE /:poId returns 404 for cross-company PO', async () => {
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/DELETE');
    const req = makeReq({ params: { id: '1', poId: '999' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(404);
  });
});

describe('PO Gate 1 — Runtime: Draft-only deletion', () => {
  beforeEach(() => {
    mockPoAuthProfile.value = {
      id: 1, userId: 'user-owner', role: 'owner', companyId: 10,
      isOwner: true, isAdmin: true, canFinance: true, canSeeDollars: true, canDelete: true,
    };
    mockDbExecuteForRuntime.fn.mockReset();
  });

  it('DELETE returns 409 when PO status is sent', async () => {
    mockDbExecuteForRuntime.fn.mockResolvedValue([[{ id: 5, status: 'sent', job_id: 1, company_id: 10 }], undefined]);
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/DELETE');
    const req = makeReq({ params: { id: '1', poId: '5' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(409);
  });

  it('DELETE returns 409 when PO status is completed', async () => {
    mockDbExecuteForRuntime.fn.mockResolvedValue([[{ id: 5, status: 'completed', job_id: 1, company_id: 10 }], undefined]);
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/DELETE');
    const req = makeReq({ params: { id: '1', poId: '5' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(409);
  });

  it('DELETE returns 409 when PO status is cancelled', async () => {
    mockDbExecuteForRuntime.fn.mockResolvedValue([[{ id: 5, status: 'cancelled', job_id: 1, company_id: 10 }], undefined]);
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/DELETE');
    const req = makeReq({ params: { id: '1', poId: '5' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(409);
  });
});

describe('PO Gate 1 — Runtime: Invalid status transitions', () => {
  beforeEach(() => {
    mockPoAuthProfile.value = {
      id: 1, userId: 'user-owner', role: 'owner', companyId: 10,
      isOwner: true, isAdmin: true, canFinance: true, canSeeDollars: true, canDelete: true,
    };
    mockDbExecuteForRuntime.fn.mockReset();
  });

  it('PUT returns 422 for invalid status value', async () => {
    mockDbExecuteForRuntime.fn.mockResolvedValue([[{ id: 5, status: 'draft', job_id: 1, company_id: 10 }], undefined]);
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/PUT');
    const req = makeReq({ params: { id: '1', poId: '5' }, body: { status: 'bogus_status' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(422);
  });

  it('PUT returns 409 for disallowed transition (completed to draft)', async () => {
    mockDbExecuteForRuntime.fn.mockResolvedValue([[{ id: 5, status: 'completed', job_id: 1, company_id: 10 }], undefined]);
    const { default: handler } = await import('../api/jobs/[id]/purchase-orders/[poId]/PUT');
    const req = makeReq({ params: { id: '1', poId: '5' }, body: { status: 'draft' } });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(409);
  });
});
`;

// Find line indices (0-based)
// Line 516 (0-based) = the NOTE comment line
// Line 659 (0-based) = blank line before "describe('PO Gate 1 — Source structure: transaction rollback"
const startIdx = 516; // inclusive — replace from here
const endIdx = 659;   // exclusive — keep from here

const out = [...lines.slice(0, startIdx), newRuntime, ...lines.slice(endIdx)];
fs.writeFileSync('src/server/__tests__/po-gate1.test.ts', out.join('\n'));
console.log('done', out.length, 'lines');
