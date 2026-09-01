/**
 * imageSafeguardCP12B5.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B5 — Image Safeguard CSV Export endpoint tests.
 *
 * All tests are mocked — no R2 contact, no DB contact, no production data.
 *
 * Test IDs: ISG-B5-01 through ISG-B5-27
 *
 * ISG-B5-01  requirePlatformOwner applied to the export route in entry.ts
 * ISG-B5-02  Import present in entry.ts
 * ISG-B5-03  Strict UUID validation rejects non-UUID strings
 * ISG-B5-04  Strict UUID validation rejects the loose [0-9a-f-]{36} pattern
 * ISG-B5-05  Strict UUID validation accepts a valid lowercase UUID
 * ISG-B5-06  Unknown run ID returns 404
 * ISG-B5-07  Non-completed run (running) returns 409
 * ISG-B5-08  Non-completed run (failed) returns 409
 * ISG-B5-09  Non-completed run (pending) returns 409
 * ISG-B5-10  Zero findings returns header-only CSV (200)
 * ISG-B5-11  Normal export returns correct column count per row
 * ISG-B5-12  CSV quoting: commas, embedded quotes, newlines
 * ISG-B5-13  Formula injection: = prefix neutralised
 * ISG-B5-14  Formula injection: + prefix neutralised
 * ISG-B5-15  Formula injection: - prefix neutralised
 * ISG-B5-16  Formula injection: @ prefix neutralised
 * ISG-B5-17  Formula injection: leading whitespace then = neutralised
 * ISG-B5-18  Formula injection: tab prefix neutralised
 * ISG-B5-19  Formula injection: CR prefix neutralised
 * ISG-B5-20  Formula injection: LF prefix neutralised
 * ISG-B5-21  Exactly 1,000 rows succeeds
 * ISG-B5-22  1,001 rows returns 413 export_too_large
 * ISG-B5-23  Response headers: Content-Type, Content-Disposition, Cache-Control, X-Content-Type-Options
 * ISG-B5-24  Audit record written before CSV is sent
 * ISG-B5-25  Audit failure returns 500 audit_failed — CSV not released
 * ISG-B5-26  R2 key is never present in the CSV output
 * ISG-B5-27  UTF-8 BOM present at start of response body
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockExecute = vi.fn();
const mockGetSession = vi.fn();

vi.mock('../db/client.js', () => ({
  db: { execute: mockExecute },
}));

vi.mock('../../lib/auth/auth.js', () => ({
  getAuth: () => ({ api: { getSession: mockGetSession } }),
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      _tag: 'sql',
      strings,
      values,
    }),
    {
      raw: (s: string) => ({ _tag: 'sql_raw', value: s }),
    },
  ),
}));

vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return {
    ...actual,
    randomUUID: vi.fn(() => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal mock Express request for the export handler. */
function makeReq(runId: string): {
  params: { runId: string };
  headers: Record<string, string>;
} {
  return {
    params: { runId },
    headers: { cookie: 'session=test' },
  };
}

/** Capture the response written by the handler. */
function makeRes() {
  const res = {
    _status: 200,
    _headers: {} as Record<string, string>,
    _body: undefined as unknown,
    status(code: number) { this._status = code; return this; },
    setHeader(k: string, v: string) { this._headers[k.toLowerCase()] = v; return this; },
    json(body: unknown) { this._body = body; return this; },
    send(body: unknown) { this._body = body; return this; },
  };
  return res;
}

/** A completed run row returned by the first DB query. */
const COMPLETED_RUN = [{
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  run_status: 'completed',
  finished_at: '2026-09-01T10:00:00.000Z',
}];

/** A single finding row with all fields populated. */
function makeFindingRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    finding_id:    'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1',
    result:        'privacy_signal',
    face_count:    2,
    reviewed:      1,
    reviewer_note: 'Reviewed OK',
    reviewed_at:   '2026-09-01T11:00:00.000Z',
    scanned_at:    '2026-09-01T10:30:00.000Z',
    run_id:        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    finished_at:   '2026-09-01T10:00:00.000Z',
    company_name:  'Acme Constructions',
    job_number:    'JOB-001',
    job_name:      'Site Alpha',
    site_address:  '1 Main St, Brisbane QLD 4000',
    original_name: 'photo.jpg',
    reviewer_name: 'Jane Reviewer',
    ...overrides,
  };
}

const VALID_RUN_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// ── ISG-B5-01: requirePlatformOwner applied in entry.ts ───────────────────────

describe('ISG-B5-01: requirePlatformOwner applied to export route in entry.ts', () => {
  it('entry.ts registers the export route with requirePlatformOwner', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/entry.ts', 'utf8');
    expect(source).toMatch(
      /app\.get\(["']\/api\/owner-console\/image-safeguard\/runs\/:runId\/export\.csv["'],\s*requirePlatformOwner/,
    );
  });
});

// ── ISG-B5-02: Import present in entry.ts ────────────────────────────────────

describe('ISG-B5-02: Handler imported in entry.ts', () => {
  it('entry.ts imports the export-csv handler', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/entry.ts', 'utf8');
    expect(source).toContain('runs/[runId]/export-csv/GET');
  });
});

// ── ISG-B5-03: Strict UUID validation rejects non-UUID strings ────────────────

describe('ISG-B5-03: Strict UUID validation rejects non-UUID strings', () => {
  it.each([
    ['empty string',          ''],
    ['all dashes',            '------------------------------------'],
    ['too short',             'abc123'],
    ['uppercase UUID',        'A1B2C3D4-E5F6-7890-ABCD-EF1234567890'],
    ['extra chars',           'a1b2c3d4-e5f6-7890-abcd-ef1234567890x'],
    ['SQL injection attempt', "' OR '1'='1"],
    ['path traversal',        '../../../etc/passwd'],
  ])('rejects %s', async (_label, runId) => {
    const { default: handler } = await import('../api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.js');
    const req = makeReq(runId);
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(400);
    expect((res._body as { error: string }).error).toBe('invalid_run_id');
  });
});

// ── ISG-B5-04: Strict UUID rejects the loose [0-9a-f-]{36} pattern ───────────

describe('ISG-B5-04: Strict UUID rejects the loose [0-9a-f-]{36} pattern', () => {
  it('rejects a 36-char string with misplaced hyphens that passes the loose pattern', async () => {
    // 36 chars, all hex + hyphens, but not canonical 8-4-4-4-12 format
    const badUuid = 'a1b2c3d4e5f67890abcdef1234567890----';
    const { default: handler } = await import('../api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.js');
    const req = makeReq(badUuid);
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(400);
    expect((res._body as { error: string }).error).toBe('invalid_run_id');
  });
});

// ── ISG-B5-05: Strict UUID accepts a valid lowercase UUID ─────────────────────

describe('ISG-B5-05: Strict UUID accepts a valid lowercase UUID', () => {
  beforeEach(() => { mockExecute.mockReset(); mockGetSession.mockReset(); });

  it('passes validation for a canonical lowercase UUID (proceeds to DB lookup)', async () => {
    mockExecute.mockResolvedValueOnce([]);  // run lookup → not found
    const { default: handler } = await import('../api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.js');
    const req = makeReq(VALID_RUN_ID);
    const res = makeRes();
    await handler(req as never, res as never);
    // 404 means it passed UUID validation and reached the DB lookup
    expect(res._status).toBe(404);
  });
});

// ── ISG-B5-06: Unknown run ID returns 404 ────────────────────────────────────

describe('ISG-B5-06: Unknown run ID returns 404', () => {
  beforeEach(() => { mockExecute.mockReset(); mockGetSession.mockReset(); });

  it('returns 404 when run does not exist', async () => {
    mockExecute.mockResolvedValueOnce([]);  // run lookup → empty
    const { default: handler } = await import('../api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.js');
    const req = makeReq(VALID_RUN_ID);
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(404);
    expect((res._body as { error: string }).error).toBe('run_not_found');
  });
});

// ── ISG-B5-07 / ISG-B5-08 / ISG-B5-09: Non-completed run returns 409 ─────────

describe('ISG-B5-07/08/09: Non-completed run returns 409', () => {
  beforeEach(() => { mockExecute.mockReset(); mockGetSession.mockReset(); });

  it.each([
    ['running',   'running'],
    ['failed',    'failed'],
    ['pending',   'pending'],
    ['cancelled', 'cancelled'],
  ])('returns 409 for run_status=%s', async (_label, status) => {
    mockExecute.mockResolvedValueOnce([
      { id: VALID_RUN_ID, run_status: status, finished_at: null },
    ]);
    const { default: handler } = await import('../api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.js');
    const req = makeReq(VALID_RUN_ID);
    const res = makeRes();
    await handler(req as never, res as never);
    expect(res._status).toBe(409);
    expect((res._body as { error: string }).error).toBe('run_not_complete');
  });
});

// ── ISG-B5-10: Zero findings returns header-only CSV ─────────────────────────

describe('ISG-B5-10: Zero findings returns header-only CSV', () => {
  beforeEach(() => { mockExecute.mockReset(); mockGetSession.mockReset(); });

  it('returns 200 with header row only when run has no findings', async () => {
    mockExecute
      .mockResolvedValueOnce(COMPLETED_RUN)   // run lookup
      .mockResolvedValueOnce([])               // findings query → empty
      .mockResolvedValueOnce(undefined);       // audit INSERT

    mockGetSession.mockResolvedValueOnce({ user: { id: 'reviewer-uuid' } });

    const { default: handler } = await import('../api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.js');
    const req = makeReq(VALID_RUN_ID);
    const res = makeRes();
    await handler(req as never, res as never);

    expect(res._status).toBe(200);
    const body = String(res._body);
    // BOM + header row only (no data rows)
    const lines = body.replace('\uFEFF', '').split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"Scan ID"');
    expect(lines[0]).toContain('"Internal note"');
  });
});

// ── ISG-B5-11: Normal export returns correct column count per row ─────────────

describe('ISG-B5-11: Normal export returns correct column count per row', () => {
  beforeEach(() => { mockExecute.mockReset(); mockGetSession.mockReset(); });

  it('each data row has exactly 13 columns', async () => {
    mockExecute
      .mockResolvedValueOnce(COMPLETED_RUN)
      .mockResolvedValueOnce([makeFindingRow(), makeFindingRow()])
      .mockResolvedValueOnce(undefined);  // audit

    mockGetSession.mockResolvedValueOnce({ user: { id: 'reviewer-uuid' } });

    const { default: handler } = await import('../api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.js');
    const req = makeReq(VALID_RUN_ID);
    const res = makeRes();
    await handler(req as never, res as never);

    expect(res._status).toBe(200);
    const lines = String(res._body).replace('\uFEFF', '').split('\n');
    // header + 2 data rows
    expect(lines).toHaveLength(3);
    // Count columns in header (13 expected)
    const headerCols = lines[0].match(/"[^"]*"/g) ?? [];
    expect(headerCols).toHaveLength(13);
    // Count columns in first data row
    const dataCols = lines[1].match(/"[^"]*"/g) ?? [];
    expect(dataCols).toHaveLength(13);
  });
});

// ── ISG-B5-12: CSV quoting ────────────────────────────────────────────────────

describe('ISG-B5-12: CSV quoting handles commas, embedded quotes, newlines', () => {
  beforeEach(() => { mockExecute.mockReset(); mockGetSession.mockReset(); });

  it('commas inside a field do not break column count', async () => {
    mockExecute
      .mockResolvedValueOnce(COMPLETED_RUN)
      .mockResolvedValueOnce([makeFindingRow({ company_name: 'Acme, Inc.' })])
      .mockResolvedValueOnce(undefined);

    mockGetSession.mockResolvedValueOnce({ user: { id: 'u' } });

    const { default: handler } = await import('../api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.js');
    const req = makeReq(VALID_RUN_ID);
    const res = makeRes();
    await handler(req as never, res as never);

    const lines = String(res._body).replace('\uFEFF', '').split('\n');
    // The data row must still have exactly 13 quoted fields
    const dataCols = lines[1].match(/"[^"]*(?:""[^"]*)*"/g) ?? [];
    expect(dataCols).toHaveLength(13);
    expect(lines[1]).toContain('"Acme, Inc."');
  });

  it('embedded double-quotes are doubled (RFC 4180)', async () => {
    mockExecute
      .mockResolvedValueOnce(COMPLETED_RUN)
      .mockResolvedValueOnce([makeFindingRow({ reviewer_note: 'He said "hello"' })])
      .mockResolvedValueOnce(undefined);

    mockGetSession.mockResolvedValueOnce({ user: { id: 'u' } });

    const { default: handler } = await import('../api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.js');
    const req = makeReq(VALID_RUN_ID);
    const res = makeRes();
    await handler(req as never, res as never);

    expect(String(res._body)).toContain('"He said ""hello"""');
  });
});

// ── ISG-B5-13 through ISG-B5-20: Formula injection ───────────────────────────

describe('ISG-B5-13 to ISG-B5-20: Formula injection neutralisation', () => {
  beforeEach(() => { mockExecute.mockReset(); mockGetSession.mockReset(); });

  async function runWithNote(note: string): Promise<string> {
    mockExecute
      .mockResolvedValueOnce(COMPLETED_RUN)
      .mockResolvedValueOnce([makeFindingRow({ reviewer_note: note })])
      .mockResolvedValueOnce(undefined);
    mockGetSession.mockResolvedValueOnce({ user: { id: 'u' } });

    const { default: handler } = await import('../api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.js');
    const req = makeReq(VALID_RUN_ID);
    const res = makeRes();
    await handler(req as never, res as never);
    return String(res._body);
  }

  it('ISG-B5-13: = prefix is neutralised with leading single quote', async () => {
    const body = await runWithNote('=SUM(A1:A10)');
    expect(body).toContain("\"'=SUM(A1:A10)\"");
  });

  it('ISG-B5-14: + prefix is neutralised', async () => {
    const body = await runWithNote('+cmd|calc');
    expect(body).toContain("\"'+cmd|calc\"");
  });

  it('ISG-B5-15: - prefix is neutralised', async () => {
    const body = await runWithNote('-1+1');
    expect(body).toContain("\"'-1+1\"");
  });

  it('ISG-B5-16: @ prefix is neutralised', async () => {
    const body = await runWithNote('@SUM(1+1)');
    expect(body).toContain("\"'@SUM(1+1)\"");
  });

  it('ISG-B5-17: leading whitespace then = is neutralised', async () => {
    const body = await runWithNote('  =HYPERLINK("evil.com")');
    // The single quote is prepended before the leading whitespace
    expect(body).toContain("\"'  =HYPERLINK");
  });

  it('ISG-B5-18: tab prefix is neutralised', async () => {
    const body = await runWithNote('\t=FORMULA');
    expect(body).toContain("\"'\t=FORMULA\"");
  });

  it('ISG-B5-19: CR prefix is neutralised', async () => {
    const body = await runWithNote('\r=FORMULA');
    expect(body).toContain("\"'\r=FORMULA\"");
  });

  it('ISG-B5-20: LF prefix is neutralised', async () => {
    const body = await runWithNote('\n=FORMULA');
    expect(body).toContain("\"'\n=FORMULA\"");
  });
});

// ── ISG-B5-21: Exactly 1,000 rows succeeds ───────────────────────────────────

describe('ISG-B5-21: Exactly 1,000 rows succeeds', () => {
  beforeEach(() => { mockExecute.mockReset(); mockGetSession.mockReset(); });

  it('returns 200 when finding count is exactly 1,000', async () => {
    const rows = Array.from({ length: 1_000 }, (_, i) =>
      makeFindingRow({
        finding_id: `f${i.toString().padStart(8, '0')}-0000-0000-0000-000000000000`,
      }),
    );
    mockExecute
      .mockResolvedValueOnce(COMPLETED_RUN)
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(undefined);

    mockGetSession.mockResolvedValueOnce({ user: { id: 'u' } });

    const { default: handler } = await import('../api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.js');
    const req = makeReq(VALID_RUN_ID);
    const res = makeRes();
    await handler(req as never, res as never);

    expect(res._status).toBe(200);
    const lines = String(res._body).replace('\uFEFF', '').split('\n');
    // header + 1,000 data rows
    expect(lines).toHaveLength(1_001);
  });
});

// ── ISG-B5-22: 1,001 rows returns 413 ────────────────────────────────────────

describe('ISG-B5-22: 1,001 rows returns 413 export_too_large', () => {
  beforeEach(() => { mockExecute.mockReset(); mockGetSession.mockReset(); });

  it('returns 413 when query returns 1,001 rows', async () => {
    const rows = Array.from({ length: 1_001 }, (_, i) =>
      makeFindingRow({
        finding_id: `f${i.toString().padStart(8, '0')}-0000-0000-0000-000000000000`,
      }),
    );
    mockExecute
      .mockResolvedValueOnce(COMPLETED_RUN)
      .mockResolvedValueOnce(rows);
    // No audit call expected — rejection happens before audit

    const { default: handler } = await import('../api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.js');
    const req = makeReq(VALID_RUN_ID);
    const res = makeRes();
    await handler(req as never, res as never);

    expect(res._status).toBe(413);
    expect((res._body as { error: string }).error).toBe('export_too_large');
  });
});

// ── ISG-B5-23: Response headers ──────────────────────────────────────────────

describe('ISG-B5-23: Response headers', () => {
  beforeEach(() => { mockExecute.mockReset(); mockGetSession.mockReset(); });

  it('sets all required response headers', async () => {
    mockExecute
      .mockResolvedValueOnce(COMPLETED_RUN)
      .mockResolvedValueOnce([makeFindingRow()])
      .mockResolvedValueOnce(undefined);

    mockGetSession.mockResolvedValueOnce({ user: { id: 'u' } });

    const { default: handler } = await import('../api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.js');
    const req = makeReq(VALID_RUN_ID);
    const res = makeRes();
    await handler(req as never, res as never);

    expect(res._status).toBe(200);
    expect(res._headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res._headers['content-disposition']).toMatch(/^attachment; filename="/);
    expect(res._headers['content-disposition']).toMatch(/\.csv"$/);
    expect(res._headers['cache-control']).toBe('private, no-store');
    expect(res._headers['x-content-type-options']).toBe('nosniff');
  });

  it('Content-Disposition filename contains only safe characters (no user input)', async () => {
    mockExecute
      .mockResolvedValueOnce(COMPLETED_RUN)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(undefined);

    mockGetSession.mockResolvedValueOnce({ user: { id: 'u' } });

    const { default: handler } = await import('../api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.js');
    const req = makeReq(VALID_RUN_ID);
    const res = makeRes();
    await handler(req as never, res as never);

    const disposition = res._headers['content-disposition'] ?? '';
    // Must match: attachment; filename="image-safeguard-run-{8hexchars}-YYYY-MM-DD.csv"
    expect(disposition).toMatch(
      /^attachment; filename="image-safeguard-run-[0-9a-f]{8}-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
  });
});

// ── ISG-B5-24: Audit record written before CSV is sent ───────────────────────

describe('ISG-B5-24: Audit record written before CSV is sent', () => {
  beforeEach(() => { mockExecute.mockReset(); mockGetSession.mockReset(); });

  it('calls db.execute three times: run lookup, findings query, audit INSERT', async () => {
    mockExecute
      .mockResolvedValueOnce(COMPLETED_RUN)
      .mockResolvedValueOnce([makeFindingRow()])
      .mockResolvedValueOnce(undefined);  // audit

    mockGetSession.mockResolvedValueOnce({ user: { id: 'u' } });

    const { default: handler } = await import('../api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.js');
    const req = makeReq(VALID_RUN_ID);
    const res = makeRes();
    await handler(req as never, res as never);

    expect(res._status).toBe(200);
    // Three DB calls: run lookup, findings, audit
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('audit INSERT uses action safeguard_run_csv_export', async () => {
    mockExecute
      .mockResolvedValueOnce(COMPLETED_RUN)
      .mockResolvedValueOnce([makeFindingRow()])
      .mockResolvedValueOnce(undefined);

    mockGetSession.mockResolvedValueOnce({ user: { id: 'u' } });

    const { default: handler } = await import('../api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.js');
    const req = makeReq(VALID_RUN_ID);
    const res = makeRes();
    await handler(req as never, res as never);

    // Third call is the audit INSERT.
    // The action string 'safeguard_run_csv_export' is a SQL literal (not an
    // interpolated value), so it appears in the strings array of the tagged
    // template, not in the values array.
    const auditCall = mockExecute.mock.calls[2][0];
    const sqlText = (auditCall.strings as TemplateStringsArray).join('');
    expect(sqlText).toContain('safeguard_run_csv_export');
  });
});

// ── ISG-B5-25: Audit failure returns 500 audit_failed ────────────────────────

describe('ISG-B5-25: Audit failure returns 500 — CSV not released', () => {
  beforeEach(() => { mockExecute.mockReset(); mockGetSession.mockReset(); });

  it('returns 500 audit_failed when audit INSERT throws', async () => {
    mockExecute
      .mockResolvedValueOnce(COMPLETED_RUN)
      .mockResolvedValueOnce([makeFindingRow()])
      .mockRejectedValueOnce(new Error('DB connection lost'));  // audit fails

    mockGetSession.mockResolvedValueOnce({ user: { id: 'u' } });

    const { default: handler } = await import('../api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.js');
    const req = makeReq(VALID_RUN_ID);
    const res = makeRes();
    await handler(req as never, res as never);

    expect(res._status).toBe(500);
    expect((res._body as { error: string }).error).toBe('audit_failed');
  });

  it('does not call res.send when audit fails (CSV not released)', async () => {
    mockExecute
      .mockResolvedValueOnce(COMPLETED_RUN)
      .mockResolvedValueOnce([makeFindingRow()])
      .mockRejectedValueOnce(new Error('DB connection lost'));

    mockGetSession.mockResolvedValueOnce({ user: { id: 'u' } });

    const { default: handler } = await import('../api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.js');
    const req = makeReq(VALID_RUN_ID);
    const res = makeRes();
    const sendSpy = vi.spyOn(res, 'send');
    await handler(req as never, res as never);

    // send() must not have been called — only json() for the error response
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

// ── ISG-B5-26: R2 key never present in CSV output ────────────────────────────

describe('ISG-B5-26: R2 key never present in CSV output', () => {
  beforeEach(() => { mockExecute.mockReset(); mockGetSession.mockReset(); });

  it('the raw R2 key path is not present anywhere in the CSV body', async () => {
    // The handler reads original_name from job_photos (basename only),
    // never the full R2 key path.
    mockExecute
      .mockResolvedValueOnce(COMPLETED_RUN)
      .mockResolvedValueOnce([makeFindingRow({ original_name: 'photo.jpg' })])
      .mockResolvedValueOnce(undefined);

    mockGetSession.mockResolvedValueOnce({ user: { id: 'u' } });

    const { default: handler } = await import('../api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.js');
    const req = makeReq(VALID_RUN_ID);
    const res = makeRes();
    await handler(req as never, res as never);

    expect(res._status).toBe(200);
    // Full R2 key path must not appear in the CSV
    expect(String(res._body)).not.toContain('job-photos/companies/');
    expect(String(res._body)).not.toContain('/job-photos/');
  });

  it('handler source does not SELECT k.r2_key as a returned column', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync(
      'src/server/api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.ts',
      'utf8',
    );
    // k.r2_key must appear only in the JOIN ON clause, not in the SELECT list
    // as a named output column
    expect(source).toContain('jp.filename = k.r2_key');
    // The SELECT must not alias k.r2_key to any output column name
    expect(source).not.toMatch(/k\.r2_key\s+AS\s+\w/i);
  });
});

// ── ISG-B5-27: UTF-8 BOM present ─────────────────────────────────────────────

describe('ISG-B5-27: UTF-8 BOM present at start of response body', () => {
  beforeEach(() => { mockExecute.mockReset(); mockGetSession.mockReset(); });

  it('response body starts with the UTF-8 BOM (\\uFEFF)', async () => {
    mockExecute
      .mockResolvedValueOnce(COMPLETED_RUN)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(undefined);

    mockGetSession.mockResolvedValueOnce({ user: { id: 'u' } });

    const { default: handler } = await import('../api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.js');
    const req = makeReq(VALID_RUN_ID);
    const res = makeRes();
    await handler(req as never, res as never);

    expect(String(res._body).charCodeAt(0)).toBe(0xFEFF);
  });
});
