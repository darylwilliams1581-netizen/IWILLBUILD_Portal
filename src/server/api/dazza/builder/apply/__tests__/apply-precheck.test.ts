/**
 * apply-precheck.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression tests for POST /api/dazza/builder/apply — template pre-check.
 *
 * Root cause fixed: db.execute returns [rows, metadata] (MySQL2 tuple).
 * The old code used (rows as { rows: unknown[] }).rows which is always
 * undefined on the tuple, making every template appear missing and causing
 * the apply endpoint to return 404 for every valid proposal.
 *
 * Tests:
 *  1.  Existing document template with tuple-shaped db result passes the precheck
 *  2.  Existing form template with tuple-shaped db result passes
 *  3.  Document 111-style numeric ID is passed unchanged to applyBuilderOperations
 *  4.  Wrong-company document receives 404 TEMPLATE_NOT_FOUND (same as nonexistent)
 *  5.  Nonexistent document receives 404 TEMPLATE_NOT_FOUND (same as wrong-company)
 *  6.  Wrong-company and nonexistent responses are identical (no cross-tenant leak)
 *  7.  Wrong-company form template receives 404 TEMPLATE_NOT_FOUND
 *  8.  Nonexistent form template receives 404 TEMPLATE_NOT_FOUND
 *  9.  400 validation error is not TEMPLATE_NOT_FOUND
 * 10.  null templateId with createNewTemplate op bypasses the precheck entirely
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Mock db ───────────────────────────────────────────────────────────────────
// vi.mock factories are hoisted to the top of the file by Vitest.
// Variables declared in the outer scope are NOT accessible inside the factory.
// Use vi.fn() inline and retrieve the spy via the mocked module after import.

vi.mock('../../../../../db/client.js', () => ({
  db: { execute: vi.fn() },
}));

vi.mock('../../../../../lib/platform-owner-guard.js', () => ({
  getPlatformOwnerInfo: vi.fn(),
}));

vi.mock('../../../../../lib/dazza-builder-brain.js', () => ({
  applyBuilderOperations: vi.fn(),
}));

// ── Import mocked modules to get spy references ───────────────────────────────

import { db } from '../../../../../db/client.js';
import { getPlatformOwnerInfo } from '../../../../../lib/platform-owner-guard.js';
import { applyBuilderOperations } from '../../../../../lib/dazza-builder-brain.js';
import handler from '../POST.js';

const mockDbExecute = db.execute as ReturnType<typeof vi.fn>;
const mockGetPlatformOwnerInfo = getPlatformOwnerInfo as ReturnType<typeof vi.fn>;
const mockApplyBuilderOperations = applyBuilderOperations as ReturnType<typeof vi.fn>;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** MySQL2 returns [rows, metadata] — always use this shape in tests */
function mysqlTuple<T>(rows: T[]) {
  return [rows, {}] as unknown as [T[], unknown];
}

const OWNER_INFO = {
  userId: 'user-daryl',
  email: 'darylwilliams1581@gmail.com',
  isPlatformOwner: true,
};

const COMPANY_ID = 7;

/** Minimal valid apply request body for an existing document template */
function makeDocBody(overrides: Record<string, unknown> = {}) {
  return {
    templateId: 111,
    builderType: 'document',
    operations: [{ op: 'addBlock', blockType: 'paragraph', content: 'Test' }],
    instructionSummary: 'Add a paragraph',
    conversationId: 'conv-111',
    ...overrides,
  };
}

/** Minimal valid apply request body for an existing form template */
function makeFormBody(overrides: Record<string, unknown> = {}) {
  return {
    templateId: 55,
    builderType: 'form',
    operations: [{ op: 'addBlock', blockType: 'text_input', content: 'Name' }],
    instructionSummary: 'Add a text field',
    conversationId: 'conv-55',
    ...overrides,
  };
}

function makeReq(body: Record<string, unknown>): Request {
  return { body } as unknown as Request;
}

function makeRes() {
  const json = vi.fn().mockReturnThis();
  const status = vi.fn().mockReturnValue({ json });
  return { json, status } as unknown as Response & { json: typeof json; status: typeof status };
}

/** Extract the JSON body passed to res.status(N).json(body) */
function getStatusBody(res: ReturnType<typeof makeRes>): Record<string, unknown> {
  const statusSpy = res.status as ReturnType<typeof vi.fn>;
  const jsonSpy = statusSpy.mock.results[0]?.value?.json as ReturnType<typeof vi.fn> | undefined;
  return (jsonSpy?.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('apply/POST — template pre-check (MySQL2 tuple + tenant isolation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlatformOwnerInfo.mockResolvedValue(OWNER_INFO);
    // Default: applyBuilderOperations succeeds
    mockApplyBuilderOperations.mockResolvedValue({
      ok: true,
      versionId: 'v-test',
      versionNumber: 1,
      operationsApplied: 1,
    });
  });
  afterEach(() => vi.clearAllMocks());

  // ── Test 1: Existing document template — tuple shape passes ───────────────
  it('1. Existing document template with MySQL2 tuple result passes the precheck', async () => {
    // db.execute returns [rows, metadata] — the tuple shape
    mockDbExecute
      .mockResolvedValueOnce(mysqlTuple([{ company_id: COMPANY_ID }]))  // profiles
      .mockResolvedValueOnce(mysqlTuple([{ id: 111 }]));                 // document_templates

    const req = makeReq(makeDocBody());
    const res = makeRes();

    await handler(req, res as Response);

    // applyBuilderOperations must have been called — precheck passed
    expect(mockApplyBuilderOperations).toHaveBeenCalledTimes(1);
    // No 404 was returned
    expect(res.status).not.toHaveBeenCalledWith(404);
    // Success response
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  // ── Test 2: Existing form template — tuple shape passes ───────────────────
  it('2. Existing form template with MySQL2 tuple result passes the precheck', async () => {
    mockDbExecute
      .mockResolvedValueOnce(mysqlTuple([{ company_id: COMPANY_ID }]))  // profiles
      .mockResolvedValueOnce(mysqlTuple([{ id: 55 }]));                  // form_templates

    const req = makeReq(makeFormBody());
    const res = makeRes();

    await handler(req, res as Response);

    expect(mockApplyBuilderOperations).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  // ── Test 3: Numeric ID 111 passed unchanged to applyBuilderOperations ─────
  it('3. Document 111 numeric ID is passed unchanged to applyBuilderOperations', async () => {
    mockDbExecute
      .mockResolvedValueOnce(mysqlTuple([{ company_id: COMPANY_ID }]))
      .mockResolvedValueOnce(mysqlTuple([{ id: 111 }]));

    const req = makeReq(makeDocBody({ templateId: 111 }));
    const res = makeRes();

    await handler(req, res as Response);

    expect(mockApplyBuilderOperations).toHaveBeenCalledTimes(1);
    const callArg = mockApplyBuilderOperations.mock.calls[0][0] as { templateId: number };
    // The exact numeric ID 111 must reach applyBuilderOperations
    expect(callArg.templateId).toBe(111);
  });

  // ── Test 4: Wrong-company document → 404 TEMPLATE_NOT_FOUND ──────────────
  it('4. Wrong-company document receives 404 with code TEMPLATE_NOT_FOUND', async () => {
    mockDbExecute
      .mockResolvedValueOnce(mysqlTuple([{ company_id: COMPANY_ID }]))  // profiles → company 7
      .mockResolvedValueOnce(mysqlTuple([]));                            // document_templates WHERE id=111 AND company_id=7 → empty

    const req = makeReq(makeDocBody({ templateId: 111 }));
    const res = makeRes();

    await handler(req, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    const body = getStatusBody(res);
    expect(body.code).toBe('TEMPLATE_NOT_FOUND');
    expect(body.error).toBe('Template not found.');
    // Must NOT reveal cross-tenant existence
    expect(String(body.error)).not.toMatch(/does not belong/i);
    expect(String(body.error)).not.toMatch(/another company/i);
    // applyBuilderOperations must NOT have been called
    expect(mockApplyBuilderOperations).not.toHaveBeenCalled();
    // Exactly 2 db calls: profiles + one tenant-scoped query (no third probe)
    expect(mockDbExecute).toHaveBeenCalledTimes(2);
  });

  // ── Test 5: Nonexistent document → 404 TEMPLATE_NOT_FOUND ────────────────
  it('5. Nonexistent document receives 404 with code TEMPLATE_NOT_FOUND', async () => {
    mockDbExecute
      .mockResolvedValueOnce(mysqlTuple([{ company_id: COMPANY_ID }]))
      .mockResolvedValueOnce(mysqlTuple([]));  // id=999 AND company_id=7 → empty

    const req = makeReq(makeDocBody({ templateId: 999 }));
    const res = makeRes();

    await handler(req, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    const body = getStatusBody(res);
    expect(body.code).toBe('TEMPLATE_NOT_FOUND');
    expect(body.error).toBe('Template not found.');
    expect(mockApplyBuilderOperations).not.toHaveBeenCalled();
    expect(mockDbExecute).toHaveBeenCalledTimes(2);
  });

  // ── Test 6: Wrong-company and nonexistent responses are identical ─────────
  it('6. Wrong-company and nonexistent responses are byte-identical (no cross-tenant leak)', async () => {
    // Wrong-company
    mockDbExecute
      .mockResolvedValueOnce(mysqlTuple([{ company_id: COMPANY_ID }]))
      .mockResolvedValueOnce(mysqlTuple([]));
    const req1 = makeReq(makeDocBody({ templateId: 111 }));
    const res1 = makeRes();
    await handler(req1, res1 as Response);

    // Capture res1 assertions BEFORE clearing mocks
    expect(res1.status).toHaveBeenCalledWith(404);
    const body1 = getStatusBody(res1);
    expect(body1.code).toBe('TEMPLATE_NOT_FOUND');
    expect(String(body1.error)).not.toMatch(/does not belong/i);

    vi.clearAllMocks();
    mockGetPlatformOwnerInfo.mockResolvedValue(OWNER_INFO);
    mockApplyBuilderOperations.mockResolvedValue({ ok: true, versionId: 'v-test', versionNumber: 1, operationsApplied: 1 });

    // Nonexistent
    mockDbExecute
      .mockResolvedValueOnce(mysqlTuple([{ company_id: COMPANY_ID }]))
      .mockResolvedValueOnce(mysqlTuple([]));
    const req2 = makeReq(makeDocBody({ templateId: 999 }));
    const res2 = makeRes();
    await handler(req2, res2 as Response);

    expect(res2.status).toHaveBeenCalledWith(404);
    const body2 = getStatusBody(res2);
    expect(body2.code).toBe('TEMPLATE_NOT_FOUND');
    expect(String(body2.error)).not.toMatch(/does not belong/i);

    // Both must return the same code and error text
    expect(body1.code).toBe(body2.code);
    expect(body1.error).toBe(body2.error);
  });

  // ── Test 7: Wrong-company form template → 404 TEMPLATE_NOT_FOUND ─────────
  it('7. Wrong-company form template receives 404 with code TEMPLATE_NOT_FOUND', async () => {
    mockDbExecute
      .mockResolvedValueOnce(mysqlTuple([{ company_id: COMPANY_ID }]))
      .mockResolvedValueOnce(mysqlTuple([]));  // form_templates WHERE id=55 AND company_id=7 → empty

    const req = makeReq(makeFormBody({ templateId: 55 }));
    const res = makeRes();

    await handler(req, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    const body = getStatusBody(res);
    expect(body.code).toBe('TEMPLATE_NOT_FOUND');
    expect(body.error).toBe('Template not found.');
    expect(mockApplyBuilderOperations).not.toHaveBeenCalled();
    expect(mockDbExecute).toHaveBeenCalledTimes(2);
  });

  // ── Test 8: Nonexistent form template → 404 TEMPLATE_NOT_FOUND ───────────
  it('8. Nonexistent form template receives 404 with code TEMPLATE_NOT_FOUND', async () => {
    mockDbExecute
      .mockResolvedValueOnce(mysqlTuple([{ company_id: COMPANY_ID }]))
      .mockResolvedValueOnce(mysqlTuple([]));

    const req = makeReq(makeFormBody({ templateId: 999 }));
    const res = makeRes();

    await handler(req, res as Response);

    expect(res.status).toHaveBeenCalledWith(404);
    const body = getStatusBody(res);
    expect(body.code).toBe('TEMPLATE_NOT_FOUND');
    expect(mockApplyBuilderOperations).not.toHaveBeenCalled();
  });

  // ── Test 9: 400 validation error is not TEMPLATE_NOT_FOUND ───────────────
  it('9. Missing instructionSummary returns 400, not TEMPLATE_NOT_FOUND', async () => {
    // No db calls needed — validation fires before the precheck
    const req = makeReq(makeDocBody({ instructionSummary: '' }));
    const res = makeRes();

    await handler(req, res as Response);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = getStatusBody(res);
    expect(body.code).not.toBe('TEMPLATE_NOT_FOUND');
    expect(String(body.error ?? '')).toMatch(/instructionSummary/i);
    expect(mockApplyBuilderOperations).not.toHaveBeenCalled();
    expect(mockDbExecute).not.toHaveBeenCalled();
  });

  // ── Test 10: null templateId with createNewTemplate bypasses precheck ─────
  it('10. null templateId with createNewTemplate op bypasses the precheck entirely', async () => {
    // No db calls for the precheck — applyBuilderOperations handles the new-doc flow
    const req = makeReq({
      templateId: null,
      builderType: 'document',
      operations: [{ op: 'createNewTemplate', name: 'New SWMS', templateType: 'swms' }],
      instructionSummary: 'Create a new SWMS template',
      conversationId: 'conv-new',
    });
    const res = makeRes();

    await handler(req, res as Response);

    // applyBuilderOperations called — precheck was skipped
    expect(mockApplyBuilderOperations).toHaveBeenCalledTimes(1);
    // No 404 returned
    expect(res.status).not.toHaveBeenCalledWith(404);
    // No db calls for the precheck (profiles + template lookup skipped)
    expect(mockDbExecute).not.toHaveBeenCalled();
  });
});
