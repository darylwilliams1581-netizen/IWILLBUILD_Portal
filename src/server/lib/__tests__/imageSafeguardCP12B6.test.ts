/**
 * imageSafeguardCP12B6.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B6 — Targeted Step-B tests per the security review document.
 *
 * ISG-B6-01  status endpoint: configured=true when OPENAI_API_KEY + DAZZA_V3_ENABLED set
 * ISG-B6-02  status endpoint: configured=false when no scanner secrets set
 * ISG-B6-03  non-owner 401 on status, scan, export.csv (source-level guard check)
 * ISG-B6-04  non-owner 403 on status, scan, export.csv (source-level guard check)
 * ISG-B6-05  scan POST outer catch: missing table → 503 schema_not_ready, no SQL leak
 * ISG-B6-06  scan POST outer catch: generic error → 500 scan_initiate_failed, no SQL leak
 * ISG-B6-07  Dazza v3 safeguard tools never return r2_key, signed URLs, or image bytes
 * ISG-B6-08  Run Scan button disabled when status.configured === false
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared mock setup ─────────────────────────────────────────────────────────

const mockExecute = vi.fn();
const mockGetSession = vi.fn();

vi.mock('../../db/client.js', () => ({
  db: { execute: mockExecute },
}));

vi.mock('../../../lib/auth/auth.js', () => ({
  getAuth: () => ({ api: { getSession: mockGetSession } }),
}));

// ── ISG-B6-01: configured=true when OPENAI_API_KEY + DAZZA_V3_ENABLED set ────

describe('ISG-B6-01: getAdapterCapability returns configured=true with openai_vision secrets', () => {
  beforeEach(() => { vi.resetModules(); });

  it('returns configured:true, provider:openai_vision when both secrets present', async () => {
    vi.doMock('#airo/secrets', () => ({
      getSecret: (key: string) => {
        if (key === 'OPENAI_API_KEY')    return 'sk-test-key';
        if (key === 'DAZZA_V3_ENABLED')  return '1';
        return null;
      },
    }));
    const { getAdapterCapability } = await import('../imageSafeguard/scannerAdapter.js');
    const cap = getAdapterCapability();
    expect(cap.configured).toBe(true);
    expect(cap.provider).toBe('openai_vision');
    expect(cap.reason).toBeNull();
  });

  it('python_worker takes priority when SCANNER_WORKER_URL + SECRET both set', async () => {
    vi.doMock('#airo/secrets', () => ({
      getSecret: (key: string) => {
        if (key === 'SCANNER_WORKER_URL')    return 'http://worker:8080';
        if (key === 'SCANNER_WORKER_SECRET') return 'secret123';
        if (key === 'OPENAI_API_KEY')        return 'sk-test-key';
        if (key === 'DAZZA_V3_ENABLED')      return '1';
        return null;
      },
    }));
    const { getAdapterCapability } = await import('../imageSafeguard/scannerAdapter.js');
    const cap = getAdapterCapability();
    expect(cap.configured).toBe(true);
    expect(cap.provider).toBe('python_worker');
  });
});

// ── ISG-B6-02: configured=false when no scanner secrets set ──────────────────

describe('ISG-B6-02: getAdapterCapability returns configured=false with no scanner secrets', () => {
  beforeEach(() => { vi.resetModules(); });

  it('returns configured:false when no secrets present', async () => {
    vi.doMock('#airo/secrets', () => ({
      getSecret: (_key: string) => null,
    }));
    const { getAdapterCapability } = await import('../imageSafeguard/scannerAdapter.js');
    const cap = getAdapterCapability();
    expect(cap.configured).toBe(false);
    expect(cap.provider).toBeNull();
    expect(cap.reason).toBeTruthy();
  });

  it('returns configured:false when only OPENAI_API_KEY set (DAZZA_V3_ENABLED missing)', async () => {
    vi.doMock('#airo/secrets', () => ({
      getSecret: (key: string) => (key === 'OPENAI_API_KEY' ? 'sk-test' : null),
    }));
    const { getAdapterCapability } = await import('../imageSafeguard/scannerAdapter.js');
    const cap = getAdapterCapability();
    expect(cap.configured).toBe(false);
  });

  it('returns configured:false when SCANNER_WORKER_URL set but SCANNER_WORKER_SECRET missing', async () => {
    vi.doMock('#airo/secrets', () => ({
      getSecret: (key: string) => (key === 'SCANNER_WORKER_URL' ? 'http://worker' : null),
    }));
    const { getAdapterCapability } = await import('../imageSafeguard/scannerAdapter.js');
    const cap = getAdapterCapability();
    expect(cap.configured).toBe(false);
    expect(cap.provider).toBeNull();
  });
});

// ── ISG-B6-03 & ISG-B6-04: non-owner 401/403 on all three routes ─────────────

describe('ISG-B6-03/04: requirePlatformOwner returns 401/403 on status, scan, export.csv', () => {
  it('platform-owner-guard returns 401 for unauthenticated requests', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/server/lib/platform-owner-guard.ts', 'utf8');
    expect(src).toContain('res.status(401)');
    expect(src).toContain("error: 'Unauthorised'");
  });

  it('platform-owner-guard returns 403 for authenticated non-owner requests', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/server/lib/platform-owner-guard.ts', 'utf8');
    expect(src).toContain('res.status(403)');
    expect(src).toContain('Owner Console access is restricted');
  });

  it('GET /api/owner-console/image-safeguard/status has requirePlatformOwner', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/server/entry.ts', 'utf8');
    expect(src).toMatch(
      /app\.get\(["']\/api\/owner-console\/image-safeguard\/status["'],\s*requirePlatformOwner/,
    );
  });

  it('POST /api/owner-console/image-safeguard/scan has requirePlatformOwner', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/server/entry.ts', 'utf8');
    expect(src).toMatch(
      /app\.post\(["']\/api\/owner-console\/image-safeguard\/scan["'],\s*requirePlatformOwner/,
    );
  });

  it('GET /api/owner-console/image-safeguard/runs/:runId/export.csv has requirePlatformOwner', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/server/entry.ts', 'utf8');
    expect(src).toMatch(
      /app\.get\(["']\/api\/owner-console\/image-safeguard\/runs\/:runId\/export\.csv["'],\s*requirePlatformOwner/,
    );
  });
});

// ── ISG-B6-04b: hasActiveRun missing-table → 503, not 409 ────────────────────

describe('ISG-B6-04b: hasActiveRun missing table surfaces as 503 schema_not_ready, not 409', () => {
  it('SchemaNotReadyError is exported from scanRunService', async () => {
    const mod = await import('../imageSafeguard/scanRunService.js');
    expect(typeof mod.SchemaNotReadyError).toBe('function');
  });

  it('hasActiveRun throws SchemaNotReadyError when scan_runs table is missing', async () => {
    vi.resetModules();
    const missingTableErr = Object.assign(
      new Error("Table 'db.image_safeguard_scan_runs' doesn't exist"),
      { code: 'ER_NO_SUCH_TABLE' },
    );
    mockExecute.mockRejectedValueOnce(missingTableErr);
    const { hasActiveRun, SchemaNotReadyError } = await import(
      '../imageSafeguard/scanRunService.js'
    );
    await expect(hasActiveRun()).rejects.toBeInstanceOf(SchemaNotReadyError);
  });

  it('hasActiveRun returns true (fail-closed) for non-schema DB errors', async () => {
    vi.resetModules();
    mockExecute.mockRejectedValueOnce(new Error('Lock wait timeout exceeded'));
    const { hasActiveRun } = await import('../imageSafeguard/scanRunService.js');
    const result = await hasActiveRun();
    expect(result).toBe(true);
  });

  it('scan POST returns 503 when hasActiveRun throws SchemaNotReadyError', async () => {
    vi.resetModules();
    vi.doMock('#airo/secrets', () => ({
      getSecret: (key: string) => {
        if (key === 'OPENAI_API_KEY')       return 'sk-test';
        if (key === 'DAZZA_V3_ENABLED')     return '1';
        if (key === 'PLATFORM_OWNER_EMAIL') return 'owner@test.com';
        return null;
      },
    }));
    mockGetSession.mockResolvedValue({ user: { id: 'user-123' } });
    // cursor query succeeds, then hasActiveRun throws ER_NO_SUCH_TABLE
    mockExecute
      .mockResolvedValueOnce([[{ last_successful_scan_at: null }]])  // cursor
      .mockRejectedValueOnce(
        Object.assign(
          new Error("Table 'db.image_safeguard_scan_runs' doesn't exist"),
          { code: 'ER_NO_SUCH_TABLE' },
        ),
      );

    const handler = (await import(
      '../../api/owner-console/image-safeguard/scan/POST.js'
    )).default;

    const req = { body: {}, headers: {} } as never;
    const jsonMock = vi.fn();
    const statusMock = vi.fn(() => ({ json: jsonMock }));
    const res = { status: statusMock } as never;

    await handler(req, res);

    expect(statusMock).toHaveBeenCalledWith(503);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'schema_not_ready' }),
    );
    // Must not be 409 scan_already_running
    expect(statusMock).not.toHaveBeenCalledWith(409);
  });

  it('scan POST returns 409 when a real active run row exists', async () => {
    vi.resetModules();
    vi.doMock('#airo/secrets', () => ({
      getSecret: (key: string) => {
        if (key === 'OPENAI_API_KEY')       return 'sk-test';
        if (key === 'DAZZA_V3_ENABLED')     return '1';
        if (key === 'PLATFORM_OWNER_EMAIL') return 'owner@test.com';
        return null;
      },
    }));
    mockGetSession.mockResolvedValue({ user: { id: 'user-123' } });
    // cursor query succeeds, hasActiveRun returns cnt=1 (real active run)
    mockExecute
      .mockResolvedValueOnce([[{ last_successful_scan_at: null }]])  // cursor
      .mockResolvedValueOnce([{ cnt: 1 }]);                          // hasActiveRun → true

    const handler = (await import(
      '../../api/owner-console/image-safeguard/scan/POST.js'
    )).default;

    const req = { body: {}, headers: {} } as never;
    const jsonMock = vi.fn();
    const statusMock = vi.fn(() => ({ json: jsonMock }));
    const res = { status: statusMock } as never;

    await handler(req, res);

    expect(statusMock).toHaveBeenCalledWith(409);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'scan_already_running' }),
    );
  });

  it('scan POST returns 500 scan_initiate_failed when non-schema error mentions table name', async () => {
    vi.resetModules();
    vi.doMock('#airo/secrets', () => ({
      getSecret: (key: string) => {
        if (key === 'OPENAI_API_KEY')       return 'sk-test';
        if (key === 'DAZZA_V3_ENABLED')     return '1';
        if (key === 'PLATFORM_OWNER_EMAIL') return 'owner@test.com';
        return null;
      },
    }));
    mockGetSession.mockResolvedValue({ user: { id: 'user-123' } });
    // cursor succeeds, hasActiveRun returns false (no active run),
    // createScanRun throws a lock error whose message happens to mention the table name
    mockExecute
      .mockResolvedValueOnce([[{ last_successful_scan_at: null }]])  // cursor
      .mockResolvedValueOnce([[{ cnt: 0 }]])                         // hasActiveRun → false
      .mockRejectedValueOnce(
        new Error('Lock wait timeout on image_safeguard_scan_runs; try restarting transaction'),
      );

    const handler = (await import(
      '../../api/owner-console/image-safeguard/scan/POST.js'
    )).default;

    const req = { body: {}, headers: {} } as never;
    const jsonMock = vi.fn();
    const statusMock = vi.fn(() => ({ json: jsonMock }));
    const res = { status: statusMock } as never;

    await handler(req, res);

    // Must be 500 scan_initiate_failed — NOT 503 schema_not_ready
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'scan_initiate_failed' }),
    );
    expect(statusMock).not.toHaveBeenCalledWith(503);
  });
});

// ── ISG-B6-05: missing table → 503 schema_not_ready, no SQL leak ─────────────

describe('ISG-B6-05: scan POST outer catch — missing table returns 503 schema_not_ready', () => {
  it('outer catch block distinguishes schema errors from other errors', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(
      'src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8',
    );
    expect(src).toContain('schema_not_ready');
    expect(src).toContain('Image Safeguard storage is not ready.');
    expect(src).toContain('isSchemaError');
    // Must detect MySQL ER_NO_SUCH_TABLE and similar patterns
    expect(src).toContain('ER_NO_SUCH_TABLE');
    // Must NOT use table-name substring match — too broad, causes false positives
    // when the table exists but throws a lock/FK/connection error mentioning the table name
    expect(src).not.toContain('/image_safeguard_scan_runs/i');
  });

  it('schema_not_ready response uses 503 status', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(
      'src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8',
    );
    // Find the schema_not_ready block and confirm it uses 503
    const schemaIdx = src.indexOf('schema_not_ready');
    const blockAround = src.slice(Math.max(0, schemaIdx - 100), schemaIdx + 200);
    expect(blockAround).toContain('503');
  });

  it('outer catch body never contains SQL text, stack traces, or secret names', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(
      'src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8',
    );
    // Find the outer catch block (last catch in the file)
    const outerCatchIdx = src.lastIndexOf('} catch (outerErr');
    expect(outerCatchIdx).toBeGreaterThan(-1);
    const catchBody = src.slice(outerCatchIdx);
    // The response body strings must not echo internal detail.
    // Note: outerErr.message IS read for isSchemaError detection — that is correct.
    // What must NOT appear is outerErr.message/stack inside a res.json() call.
    expect(catchBody).not.toContain('outerErr.stack');
    expect(catchBody).not.toContain('R2_ACCESS_KEY_ID');
    expect(catchBody).not.toContain('R2_SECRET_ACCESS_KEY');
    expect(catchBody).not.toContain('DATABASE_URL');
    expect(catchBody).not.toContain('mysql://');
    // The two res.json() calls in the catch must only use literal strings
    const jsonCalls = catchBody.match(/res\.status\(\d+\)\.json\(\{[^}]+\}\)/g) ?? [];
    for (const call of jsonCalls) {
      expect(call).not.toContain('outerErr');
      expect(call).not.toContain('msg');
    }
  });

  it('simulated ER_NO_SUCH_TABLE error produces schema_not_ready response', async () => {
    vi.resetModules();
    // Mock the scanner as configured so we get past the capability check
    vi.doMock('#airo/secrets', () => ({
      getSecret: (key: string) => {
        if (key === 'OPENAI_API_KEY')       return 'sk-test';
        if (key === 'DAZZA_V3_ENABLED')     return '1';
        if (key === 'PLATFORM_OWNER_EMAIL') return 'owner@test.com';
        return null;
      },
    }));
    // Mock getSession to return a valid user
    mockGetSession.mockResolvedValue({ user: { id: 'user-123' } });
    // Call sequence in the handler:
    //   1. resolveDateRange → getLastSuccessfulScanAt → db.execute (cursor query)
    //   2. hasActiveRun → db.execute → returns [{cnt:0}] (no active run)
    //   3. createScanRun → db.execute → throws ER_NO_SUCH_TABLE
    mockExecute
      .mockResolvedValueOnce([[{ last_successful_scan_at: null }]])  // cursor
      .mockResolvedValueOnce([[{ cnt: 0 }]])                         // hasActiveRun → false
      .mockRejectedValueOnce(
        Object.assign(new Error("Table 'db.image_safeguard_scan_runs' doesn't exist"), {
          code: 'ER_NO_SUCH_TABLE',
        }),
      );

    const handler = (await import(
      '../../api/owner-console/image-safeguard/scan/POST.js'
    )).default;

    const req = {
      body: {},
      headers: {},
    } as never;
    const jsonMock = vi.fn();
    const statusMock = vi.fn(() => ({ json: jsonMock }));
    const res = { status: statusMock } as never;

    await handler(req, res);

    expect(statusMock).toHaveBeenCalledWith(503);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'schema_not_ready' }),
    );
    // Response body must not contain SQL or table names
    const body = jsonMock.mock.calls[0][0] as Record<string, string>;
    expect(body.message).not.toMatch(/image_safeguard_scan_runs/i);
    expect(body.message).not.toMatch(/doesn'?t exist/i);
    expect(body.message).not.toMatch(/ER_NO_SUCH_TABLE/i);
  });
});

// ── ISG-B6-06: generic error → 500 scan_initiate_failed, no SQL leak ─────────

describe('ISG-B6-06: scan POST outer catch — generic error returns 500 scan_initiate_failed', () => {
  it('scan_initiate_failed response uses 500 status', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(
      'src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8',
    );
    expect(src).toContain('scan_initiate_failed');
    expect(src).toContain('Scan could not be started.');
    // Find the scan_initiate_failed block and confirm it uses 500
    const failIdx = src.indexOf('scan_initiate_failed');
    const blockAround = src.slice(Math.max(0, failIdx - 100), failIdx + 200);
    expect(blockAround).toContain('500');
  });

  it('simulated generic error produces scan_initiate_failed response', async () => {
    vi.resetModules();
    vi.doMock('#airo/secrets', () => ({
      getSecret: (key: string) => {
        if (key === 'OPENAI_API_KEY')       return 'sk-test';
        if (key === 'DAZZA_V3_ENABLED')     return '1';
        if (key === 'PLATFORM_OWNER_EMAIL') return 'owner@test.com';
        return null;
      },
    }));
    mockGetSession.mockResolvedValue({ user: { id: 'user-123' } });
    // Call sequence:
    //   1. cursor query → succeeds
    //   2. hasActiveRun → [{cnt:0}] (no active run)
    //   3. createScanRun → throws a non-schema error
    mockExecute
      .mockResolvedValueOnce([[{ last_successful_scan_at: null }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockRejectedValueOnce(new Error('Connection timeout'));

    const handler = (await import(
      '../../api/owner-console/image-safeguard/scan/POST.js'
    )).default;

    const req = { body: {}, headers: {} } as never;
    const jsonMock = vi.fn();
    const statusMock = vi.fn(() => ({ json: jsonMock }));
    const res = { status: statusMock } as never;

    await handler(req, res);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'scan_initiate_failed' }),
    );
    // Must not echo the original error message
    const body = jsonMock.mock.calls[0][0] as Record<string, string>;
    expect(body.message).not.toContain('Connection timeout');
  });
});

// ── ISG-B6-07: Dazza v3 safeguard tools never return r2_key, signed URLs, bytes

describe('ISG-B6-07: Dazza v3 safeguard tools never return r2_key, signed URLs, or image bytes', () => {
  it('toolImageSafeguardRunDetail SELECT excludes r2_key column', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/server/lib/dazza-v3-tools.ts', 'utf8');
    // Find the findings SELECT inside toolImageSafeguardRunDetail
    const fnIdx = src.indexOf('async function toolImageSafeguardRunDetail');
    expect(fnIdx).toBeGreaterThan(-1);
    const fnBody = src.slice(fnIdx, fnIdx + 1500);
    // Must select specific safe columns — not SELECT *
    expect(fnBody).toContain('SELECT id, company_id, finding_type, face_count');
    // Must NOT select r2_key
    expect(fnBody).not.toContain('r2_key');
    expect(fnBody).not.toContain('r2Key');
  });

  it('toolImageSafeguardStatus does not query image_safeguard_finding_keys', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/server/lib/dazza-v3-tools.ts', 'utf8');
    const fnIdx = src.indexOf('async function toolImageSafeguardStatus');
    expect(fnIdx).toBeGreaterThan(-1);
    const fnBody = src.slice(fnIdx, fnIdx + 2000);
    expect(fnBody).not.toContain('image_safeguard_finding_keys');
    expect(fnBody).not.toContain('r2_key');
  });

  it('toolImageSafeguardTriggerRun does not import r2ImageFetcher or r2Config', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/server/lib/dazza-v3-tools.ts', 'utf8');
    const fnIdx = src.indexOf('async function toolImageSafeguardTriggerRun');
    expect(fnIdx).toBeGreaterThan(-1);
    const fnBody = src.slice(fnIdx, fnIdx + 3000);
    expect(fnBody).not.toContain('r2ImageFetcher');
    expect(fnBody).not.toContain('r2Config');
    expect(fnBody).not.toContain('loadR2Config');
    expect(fnBody).not.toContain('S3Client');
    expect(fnBody).not.toContain('GetObjectCommand');
  });

  it('Dazza tool notes explicitly state R2 keys are never returned', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/server/lib/dazza-v3-tools.ts', 'utf8');
    // toolImageSafeguardStatus:  'R2 keys and image bytes are never returned via this tool.'
    // toolImageSafeguardRunDetail: 'R2 keys are never returned. ...'
    // Both contain the phrase 'R2 keys' + 'never returned'
    const statusNote   = src.includes('R2 keys and image bytes are never returned via this tool.');
    const detailNote   = src.includes('R2 keys are never returned.');
    expect(statusNote).toBe(true);
    expect(detailNote).toBe(true);
  });

  it('Dazza tool definitions do not expose r2_key, signedUrl, or imageBytes in their schemas', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/server/lib/dazza-v3-tools.ts', 'utf8');
    // Find the three tool definition blocks
    const statusDefIdx  = src.indexOf("name: 'v3_image_safeguard_status'");
    const triggerDefIdx = src.indexOf("name: 'v3_image_safeguard_trigger_run'");
    const detailDefIdx  = src.indexOf("name: 'v3_image_safeguard_run_detail'");
    expect(statusDefIdx).toBeGreaterThan(-1);
    expect(triggerDefIdx).toBeGreaterThan(-1);
    expect(detailDefIdx).toBeGreaterThan(-1);
    // Extract the three definition blocks (up to the next tool definition)
    const allDefs = src.slice(statusDefIdx, detailDefIdx + 500);
    expect(allDefs).not.toContain('r2_key');
    expect(allDefs).not.toContain('signedUrl');
    expect(allDefs).not.toContain('imageBytes');
    expect(allDefs).not.toContain('image_data');
  });

  it('no Dazza safeguard tool imports r2ImageFetcher at the module level', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/server/lib/dazza-v3-tools.ts', 'utf8');
    // Top-level imports (before first function declaration)
    const firstFnIdx = src.indexOf('\nasync function ');
    const imports = src.slice(0, firstFnIdx);
    expect(imports).not.toContain('r2ImageFetcher');
    expect(imports).not.toContain('imageClassifier');
  });
});

// ── ISG-B6-08: Run Scan button disabled when status.configured === false ──────

describe('ISG-B6-08: Run Scan button disabled when status.configured === false', () => {
  it('canScan is derived from status.configured AND !scanning', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(
      'src/components/owner-console/ImageSafeguardTab.tsx', 'utf8',
    );
    expect(src).toContain('const canScan = Boolean(status?.configured) && !scanning');
  });

  it('Run Scan button has disabled={!canScan}', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(
      'src/components/owner-console/ImageSafeguardTab.tsx', 'utf8',
    );
    expect(src).toContain('disabled={!canScan}');
    expect(src).toContain('aria-disabled={!canScan}');
  });

  it('Run Scan button has aria-describedby pointing to scan-disabled-reason when not configured', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(
      'src/components/owner-console/ImageSafeguardTab.tsx', 'utf8',
    );
    expect(src).toContain('aria-describedby');
    expect(src).toContain('scan-disabled-reason');
    expect(src).toContain('id="scan-disabled-reason"');
  });

  it('the not-configured explanation element is only rendered when !status.configured', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(
      'src/components/owner-console/ImageSafeguardTab.tsx', 'utf8',
    );
    // The element with scan-disabled-reason must be inside a !status.configured conditional
    const reasonIdx = src.indexOf('scan-disabled-reason');
    const blockBefore = src.slice(Math.max(0, reasonIdx - 300), reasonIdx);
    expect(blockBefore).toMatch(/!status\.configured|status\.configured.*===.*false/);
  });

  it('configured indicator shows green dot when configured=true', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(
      'src/components/owner-console/ImageSafeguardTab.tsx', 'utf8',
    );
    // The status dot uses bg-emerald-500 for configured and bg-amber-400 for not configured
    expect(src).toContain('bg-emerald-500');
    expect(src).toContain('bg-amber-400');
    expect(src).toContain('status.configured');
  });
});
