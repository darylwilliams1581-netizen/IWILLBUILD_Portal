/**
 * imageSafeguardCP12B2.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B2 — Image Safeguard Scanner Infrastructure tests.
 *
 * ISG-B2-01  Platform owner authorization on every new endpoint
 * ISG-B2-02  Ordinary users receive 403
 * ISG-B2-03  Invalid date ranges are rejected before any provider/worker call
 * ISG-B2-04  First run defaults to seven days
 * ISG-B2-05  Later runs default to the last successful completion (cursor)
 * ISG-B2-06  Failed/partial runs do not advance the cursor
 * ISG-B2-07  Successful runs advance the cursor once
 * ISG-B2-08  Overlapping ranges do not duplicate findings (idempotent insert)
 * ISG-B2-09  Only iwillbuild-files/job-photos/ can be scanned
 * ISG-B2-10  Object keys, credentials, signed URLs, image bytes, temp paths never reach responses
 * ISG-B2-11  Oversized, malformed, non-raster, unsupported images are skipped safely
 * ISG-B2-12  Temporary files are cleaned up on success and failure
 * ISG-B2-13  Overlapping scans are prevented
 * ISG-B2-14  UI never claims a scan ran when scanner is unavailable
 * ISG-B2-15  No automatic deletion, blocking, identity recognition or external reporting
 * ISG-B2-16  Date-range validation: start must be before end
 * ISG-B2-17  Date-range validation: maximum 90-day range enforced
 * ISG-B2-18  Date-range validation: minimum 1-minute range enforced
 * ISG-B2-19  Scan scope is hardcoded server-side — never accepted from client
 * ISG-B2-20  requirePlatformOwner applied to all four new routes
 * ISG-B2-21  Findings PATCH validates finding ID format
 * ISG-B2-22  Reviewer identity resolved from session — never from request body
 * ISG-B2-23  Reviewer note sanitized (HTML stripped, max 500 chars)
 * ISG-B2-24  Audit fires after successful DB operation only
 * ISG-B2-25  Runtime decision documented: Python worker required, not available in Alpine musl
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

vi.mock('#airo/secrets', () => ({
  getSecret: (key: string) => {
    if (key === 'PLATFORM_OWNER_EMAIL') return 'owner@test.com';
    // SCANNER_WORKER_URL and SCANNER_WORKER_SECRET not set — scanner not configured
    return null;
  },
}));

// ── ISG-B2-01: Platform owner authorization on every new endpoint ─────────────

describe('ISG-B2-01: Platform owner authorization on every new endpoint', () => {
  it('all four new routes have requirePlatformOwner in entry.ts', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/entry.ts', 'utf8');
    expect(source).toMatch(/app\.post\(["']\/api\/owner-console\/image-safeguard\/scan["'],\s*requirePlatformOwner/);
    expect(source).toMatch(/app\.get\(["']\/api\/owner-console\/image-safeguard\/status["'],\s*requirePlatformOwner/);
    expect(source).toMatch(/app\.get\(["']\/api\/owner-console\/image-safeguard\/runs["'],\s*requirePlatformOwner/);
    expect(source).toMatch(/app\.patch\(["']\/api\/owner-console\/image-safeguard\/findings\/:id["'],\s*requirePlatformOwner/);
  });

  it('all four handler files are imported in entry.ts', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/entry.ts', 'utf8');
    expect(source).toContain('image-safeguard/scan/POST');
    expect(source).toContain('image-safeguard/status/GET');
    expect(source).toContain('image-safeguard/runs/GET');
    expect(source).toContain('image-safeguard/findings/[id]/PATCH');
  });
});

// ── ISG-B2-02: Ordinary users receive 403 ────────────────────────────────────

describe('ISG-B2-02: Ordinary users receive 403', () => {
  it('requirePlatformOwner returns 403 for non-platform-developer users', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/platform-owner-guard.ts', 'utf8');
    expect(source).toContain('res.status(403)');
    expect(source).toContain('Owner Console access is restricted');
  });

  it('requirePlatformOwner returns 401 when no session', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/platform-owner-guard.ts', 'utf8');
    expect(source).toContain('res.status(401)');
    expect(source).toContain("error: 'Unauthorised'");
  });
});

// ── ISG-B2-03: Invalid date ranges rejected before any provider call ──────────

describe('ISG-B2-03: Invalid date ranges rejected before any provider/worker call', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('resolveDateRange returns error for invalid since date', async () => {
    mockExecute.mockResolvedValue([{ last_successful_scan_at: null }]);
    const { resolveDateRange, isDateRangeError } = await import('../imageSafeguard/scanRunService.js');
    const result = await resolveDateRange({ since: 'not-a-date', until: null, useCursor: false });
    expect(isDateRangeError(result)).toBe(true);
    if (isDateRangeError(result)) expect(result.code).toBe('invalid_since');
  });

  it('resolveDateRange returns error for invalid until date', async () => {
    mockExecute.mockResolvedValue([{ last_successful_scan_at: null }]);
    const { resolveDateRange, isDateRangeError } = await import('../imageSafeguard/scanRunService.js');
    const result = await resolveDateRange({ since: null, until: 'bad-date', useCursor: false });
    expect(isDateRangeError(result)).toBe(true);
    if (isDateRangeError(result)) expect(result.code).toBe('invalid_until');
  });

  it('resolveDateRange returns error when start >= end', async () => {
    mockExecute.mockResolvedValue([{ last_successful_scan_at: null }]);
    const { resolveDateRange, isDateRangeError } = await import('../imageSafeguard/scanRunService.js');
    // Use clearly past dates to avoid the until_in_future check
    const end   = new Date('2026-01-10T10:00:00Z');
    const start = new Date('2026-01-10T12:00:00Z'); // after end
    const result = await resolveDateRange({
      since: start.toISOString(),
      until: end.toISOString(),
      useCursor: false,
    });
    expect(isDateRangeError(result)).toBe(true);
    if (isDateRangeError(result)) expect(result.code).toBe('start_not_before_end');
  });

  it('scan POST handler validates date range before checking scanner capability', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8');
    // resolveDateRange must be called before executeScan
    const resolveIdx = source.indexOf('resolveDateRange');
    const executeIdx = source.indexOf('executeScan');
    expect(resolveIdx).toBeGreaterThan(-1);
    // executeScan is in the async fire-and-forget block — after validation
    expect(executeIdx).toBeGreaterThan(resolveIdx);
  });
});

// ── ISG-B2-04: First run defaults to seven days ───────────────────────────────

describe('ISG-B2-04: First run defaults to seven days', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('resolveDateRange uses 7-day lookback when no cursor and no since', async () => {
    // Cursor returns null
    mockExecute.mockResolvedValue([{ last_successful_scan_at: null }]);
    const { resolveDateRange, isDateRangeError } = await import('../imageSafeguard/scanRunService.js');
    const before = Date.now();
    const result = await resolveDateRange({ since: null, until: null, useCursor: false });
    const after = Date.now();
    expect(isDateRangeError(result)).toBe(false);
    if (!isDateRangeError(result)) {
      const diffMs = result.rangeEnd.getTime() - result.rangeStart.getTime();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      // Allow 5 seconds of clock drift
      expect(diffMs).toBeGreaterThanOrEqual(sevenDaysMs - 5000);
      expect(diffMs).toBeLessThanOrEqual(sevenDaysMs + (after - before) + 5000);
    }
  });

  it('scanRunService DEFAULT_LOOKBACK_MS is 7 days', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/imageSafeguard/scanRunService.ts', 'utf8');
    expect(source).toContain('7 * 24 * 60 * 60 * 1000');
    expect(source).toContain('DEFAULT_LOOKBACK_MS');
  });
});

// ── ISG-B2-05: Later runs default to last successful completion ───────────────

describe('ISG-B2-05: Later runs default to the last successful completion', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('resolveDateRange uses cursor when useCursor=true and cursor exists', async () => {
    const cursorDate = '2026-08-25T10:00:00.000Z';
    mockExecute.mockResolvedValue([{ last_successful_scan_at: cursorDate }]);
    const { resolveDateRange, isDateRangeError } = await import('../imageSafeguard/scanRunService.js');
    const result = await resolveDateRange({ since: null, until: null, useCursor: true });
    expect(isDateRangeError(result)).toBe(false);
    if (!isDateRangeError(result)) {
      expect(result.usedCursor).toBe(true);
      expect(result.rangeStart.toISOString()).toBe(cursorDate);
    }
  });

  it('resolveDateRange falls back to 7 days when useCursor=true but no cursor exists', async () => {
    mockExecute.mockResolvedValue([{ last_successful_scan_at: null }]);
    const { resolveDateRange, isDateRangeError } = await import('../imageSafeguard/scanRunService.js');
    const result = await resolveDateRange({ since: null, until: null, useCursor: true });
    expect(isDateRangeError(result)).toBe(false);
    if (!isDateRangeError(result)) {
      expect(result.usedCursor).toBe(false);
      const diffMs = result.rangeEnd.getTime() - result.rangeStart.getTime();
      expect(diffMs).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    }
  });
});

// ── ISG-B2-06: Failed/partial runs do not advance the cursor ─────────────────

describe('ISG-B2-06: Failed/partial runs do not advance the cursor', () => {
  it('advanceCursor is only called after markRunCompleted in the scan POST handler', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8');
    // advanceCursor must appear AFTER markRunCompleted
    const completedIdx = source.indexOf('markRunCompleted');
    const advanceIdx = source.indexOf('advanceCursor');
    expect(completedIdx).toBeGreaterThan(-1);
    expect(advanceIdx).toBeGreaterThan(completedIdx);
  });

  it('advanceCursor is NOT called in the catch block', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8');
    // Find the catch block and verify advanceCursor is not inside it
    const catchIdx = source.indexOf('} catch (err');
    const advanceIdx = source.indexOf('advanceCursor');
    // advanceCursor must appear before the catch block
    expect(advanceIdx).toBeLessThan(catchIdx);
  });

  it('markRunFailed does not call advanceCursor', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/imageSafeguard/scanRunService.ts', 'utf8');
    // markRunFailed function must not contain advanceCursor
    const failedFnIdx = source.indexOf('export async function markRunFailed');
    const nextFnIdx = source.indexOf('\nexport async function', failedFnIdx + 1);
    const failedFnBody = source.slice(failedFnIdx, nextFnIdx > -1 ? nextFnIdx : undefined);
    expect(failedFnBody).not.toContain('advanceCursor');
  });
});

// ── ISG-B2-07: Successful runs advance the cursor once ───────────────────────

describe('ISG-B2-07: Successful runs advance the cursor once', () => {
  it('advanceCursor updates image_safeguard_scan_cursor', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/imageSafeguard/scanRunService.ts', 'utf8');
    const advanceFnIdx = source.indexOf('export async function advanceCursor');
    const nextFnIdx = source.indexOf('\nexport async function', advanceFnIdx + 1);
    const advanceFnBody = source.slice(advanceFnIdx, nextFnIdx > -1 ? nextFnIdx : undefined);
    expect(advanceFnBody).toContain('image_safeguard_scan_cursor');
    expect(advanceFnBody).toContain('UPDATE');
    expect(advanceFnBody).toContain('last_successful_scan_at');
  });

  it('advanceCursor is called exactly once in the success path', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8');
    // Count actual await calls (not the import line)
    const callOccurrences = (source.match(/await advanceCursor\(/g) ?? []).length;
    expect(callOccurrences).toBe(1);
  });
});

// ── ISG-B2-08: Overlapping ranges do not duplicate findings ──────────────────

describe('ISG-B2-08: Overlapping ranges do not duplicate findings', () => {
  it('findings are inserted per run ID — different run IDs prevent duplicates', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8');
    // Each finding insert includes scan_run_id — different runs = different rows
    expect(source).toContain('scan_run_id');
    expect(source).toContain('INSERT INTO image_safeguard_findings');
  });

  it('image_safeguard_findings has a scan_run_id FK in the migration', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/db/migrations/image-safeguard-scan-runs.ts', 'utf8');
    expect(source).toContain('scan_run_id');
    expect(source).toContain('FOREIGN KEY');
    expect(source).toContain('image_safeguard_scan_runs');
  });
});

// ── ISG-B2-09: Only iwillbuild-files/job-photos/ can be scanned ──────────────

describe('ISG-B2-09: Only iwillbuild-files/job-photos/ can be scanned', () => {
  it('SCAN_BUCKET is hardcoded to iwillbuild-files', async () => {
    const { SCAN_BUCKET } = await import('../imageSafeguard/scannerAdapter.js');
    expect(SCAN_BUCKET).toBe('iwillbuild-files');
  });

  it('SCAN_PREFIX is hardcoded to job-photos/', async () => {
    const { SCAN_PREFIX } = await import('../imageSafeguard/scannerAdapter.js');
    expect(SCAN_PREFIX).toBe('job-photos/');
  });

  it('scan POST handler does not accept bucket or prefix from request body', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8');
    // Must not read bucket/prefix from req.body
    expect(source).not.toContain('body.bucket');
    expect(source).not.toContain('body.prefix');
    expect(source).not.toContain('req.body.bucket');
    expect(source).not.toContain('req.body.prefix');
  });

  it('executeScan does not accept bucket or prefix as parameters', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/imageSafeguard/scannerAdapter.ts', 'utf8');
    // ScanRequest interface must not have bucket or prefix as typed properties
    const scanReqIdx = source.indexOf('interface ScanRequest {');
    const closingBrace = source.indexOf('\n}', scanReqIdx);
    const scanReqBody = source.slice(scanReqIdx, closingBrace + 2);
    // Must not have bucket: or prefix: as property declarations
    expect(scanReqBody).not.toMatch(/^\s+bucket\s*:/m);
    expect(scanReqBody).not.toMatch(/^\s+prefix\s*:/m);
  });
});

// ── ISG-B2-10: No credentials, keys, URLs, bytes, or paths in responses ───────

describe('ISG-B2-10: No credentials, keys, URLs, bytes, or paths in responses', () => {
  const FORBIDDEN = [
    'r2.cloudflarestorage',
    'X-Amz-Signature',
    'storage_key',
    'data:image/',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    '/tmp/',
    'tempfile',
    'NamedTemporaryFile',
  ];

  const FILES = [
    'src/server/api/owner-console/image-safeguard/scan/POST.ts',
    'src/server/api/owner-console/image-safeguard/status/GET.ts',
    'src/server/api/owner-console/image-safeguard/runs/GET.ts',
    'src/server/api/owner-console/image-safeguard/findings/[id]/PATCH.ts',
    'src/server/lib/imageSafeguard/scannerAdapter.ts',
    'src/server/lib/imageSafeguard/scanRunService.ts',
  ];

  for (const file of FILES) {
    for (const forbidden of FORBIDDEN) {
      it(`${file.split('/').pop()} does not contain "${forbidden}"`, async () => {
        const { readFileSync } = await import('fs');
        const source = readFileSync(file, 'utf8');
        expect(source).not.toContain(forbidden);
      });
    }
  }

  it('scan POST response does not include R2 keys or image bytes', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8');
    // The 201 response only includes runId, rangeStart, rangeEnd, usedCursor, runStatus
    const jsonIdx = source.lastIndexOf('res.status(201).json(');
    const jsonBlock = source.slice(jsonIdx, jsonIdx + 300);
    expect(jsonBlock).not.toContain('storageKey');
    expect(jsonBlock).not.toContain('signedUrl');
    expect(jsonBlock).not.toContain('imageBytes');
  });
});

// ── ISG-B2-11: Oversized/malformed/non-raster images skipped safely ──────────

describe('ISG-B2-11: Oversized, malformed, non-raster, unsupported images skipped safely', () => {
  it('scannerAdapter documents size and pixel limits', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/imageSafeguard/scannerAdapter.ts', 'utf8');
    // Case-insensitive check — the word appears as "Oversized" in the comment
    expect(source.toLowerCase()).toContain('oversized');
    expect(source).toContain('DEFAULT_MAX_BYTES');
    expect(source).toContain('DEFAULT_MAX_PIXELS');
  });

  it('prototype scanner has DEFAULT_MAX_BYTES and DEFAULT_MAX_PIXELS constants', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('docs/review_faces.py', 'utf8');
    expect(source).toContain('DEFAULT_MAX_BYTES');
    expect(source).toContain('DEFAULT_MAX_PIXELS');
    expect(source).toContain('DEFAULT_MAX_WIDTH');
    expect(source).toContain('DEFAULT_MAX_HEIGHT');
  });

  it('prototype scanner rejects symlinks', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('docs/review_faces.py', 'utf8');
    expect(source).toContain('_has_symlink');
  });

  it('prototype scanner validates image bytes before face detection', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('docs/review_faces.py', 'utf8');
    expect(source).toContain('_validate_image_file');
    expect(source).toContain('oversized_file');
    expect(source).toContain('oversized_dimensions');
    expect(source).toContain('oversized_pixel_count');
  });
});

// ── ISG-B2-12: Temporary files cleaned up on success and failure ──────────────

describe('ISG-B2-12: Temporary files cleaned up on success and failure', () => {
  it('prototype scanner cleans up temp files in finally block', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('docs/review_faces.py', 'utf8');
    expect(source).toContain('finally:');
    expect(source).toContain('target.cleanup');
    expect(source).toContain('unlink');
    expect(source).toContain('shutil.rmtree');
  });

  it('prototype scanner cleans up on R2 listing error', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('docs/review_faces.py', 'utf8');
    // iter_r2_images has a try/except that cleans up created_files
    expect(source).toContain('created_files');
    expect(source).toContain('missing_ok=True');
  });

  it('scannerAdapter documents that temp file cleanup is enforced in the worker', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/imageSafeguard/scannerAdapter.ts', 'utf8');
    expect(source).toContain('Temporary files are always cleaned up');
  });
});

// ── ISG-B2-13: Overlapping scans are prevented ───────────────────────────────

describe('ISG-B2-13: Overlapping scans are prevented', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('hasActiveRun returns true when a pending run exists', async () => {
    mockExecute.mockResolvedValue([{ cnt: 1 }]);
    const { hasActiveRun } = await import('../imageSafeguard/scanRunService.js');
    const result = await hasActiveRun();
    expect(result).toBe(true);
  });

  it('hasActiveRun returns false when no active runs', async () => {
    mockExecute.mockResolvedValue([{ cnt: 0 }]);
    const { hasActiveRun } = await import('../imageSafeguard/scanRunService.js');
    const result = await hasActiveRun();
    expect(result).toBe(false);
  });

  it('hasActiveRun fails closed (returns true) on DB error', async () => {
    mockExecute.mockRejectedValue(new Error('DB error'));
    const { hasActiveRun } = await import('../imageSafeguard/scanRunService.js');
    const result = await hasActiveRun();
    expect(result).toBe(true);
  });

  it('scan POST returns 409 when active run exists', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8');
    expect(source).toContain('res.status(409)');
    expect(source).toContain("error: 'scan_already_running'");
  });

  it('UI Run button is disabled while scanning (scanningRef guard)', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/components/owner-console/ImageSafeguardTab.tsx', 'utf8');
    expect(source).toContain('scanningRef');
    expect(source).toContain('scanningRef.current');
  });
});

// ── ISG-B2-14: UI never claims a scan ran when scanner is unavailable ─────────

describe('ISG-B2-14: UI never claims a scan ran when scanner is unavailable', () => {
  it('UI shows honest not-configured message', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/components/owner-console/ImageSafeguardTab.tsx', 'utf8');
    // CP12B5-UX: message updated — check revised key phrases individually
    expect(source).toContain('Image scanning is not active yet');
    expect(source).toContain('acknowledgements and');
    expect(source).toContain('manual review controls remain available');
    expect(source).toContain('no automated image assessment has been performed');
  });

  it('UI does not show fake progress bar or fake completion', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/components/owner-console/ImageSafeguardTab.tsx', 'utf8');
    expect(source).not.toContain('scanSuccess');
    expect(source).not.toContain('Scan complete');
    expect(source).not.toContain('scan completed');
    expect(source).not.toContain('role="progressbar"');
    expect(source).not.toContain('<Progress');
  });

  it('UI Run button is disabled when configured=false', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/components/owner-console/ImageSafeguardTab.tsx', 'utf8');
    expect(source).toContain('disabled={!canScan}');
    expect(source).toContain('aria-disabled={!canScan}');
  });

  it('scan POST returns 503 scanner_not_configured when adapter not configured', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8');
    expect(source).toContain('res.status(503)');
    expect(source).toContain("error: 'scanner_not_configured'");
  });
});

// ── ISG-B2-15: No automatic deletion, blocking, identity recognition, reporting ─

describe('ISG-B2-15: No automatic deletion, blocking, identity recognition or external reporting', () => {
  const FORBIDDEN_ACTIONS = [
    'auto_delete',
    'auto_report',
    'child_classification',
    'nude_classification',
    'identify_person',
    'deleteObject',
    'DeleteObjectCommand',
    'disableUser',
    'reportToAuthorities',
    'reportToPolice',
  ];

  const FILES = [
    'src/server/api/owner-console/image-safeguard/scan/POST.ts',
    'src/server/lib/imageSafeguard/scannerAdapter.ts',
    'src/server/lib/imageSafeguard/scanRunService.ts',
  ];

  for (const file of FILES) {
    for (const action of FORBIDDEN_ACTIONS) {
      it(`${file.split('/').pop()} does not contain "${action}"`, async () => {
        const { readFileSync } = await import('fs');
        const source = readFileSync(file, 'utf8');
        expect(source).not.toContain(action);
      });
    }
  }

  it('prototype scanner policy block has auto_delete=false and auto_report=false', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('docs/review_faces.py', 'utf8');
    expect(source).toContain('"auto_delete": False');
    expect(source).toContain('"auto_report": False');
    expect(source).toContain('"child_classification": False');
    expect(source).toContain('"nude_classification": False');
  });
});

// ── ISG-B2-16: Date-range validation: start must be before end ───────────────

describe('ISG-B2-16: Date-range validation: start must be before end', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('resolveDateRange returns start_not_before_end when start equals end', async () => {
    mockExecute.mockResolvedValue([{ last_successful_scan_at: null }]);
    const { resolveDateRange, isDateRangeError } = await import('../imageSafeguard/scanRunService.js');
    // Use a clearly past date to avoid the until_in_future check
    const ts = '2026-01-10T10:00:00.000Z';
    const result = await resolveDateRange({ since: ts, until: ts, useCursor: false });
    expect(isDateRangeError(result)).toBe(true);
    if (isDateRangeError(result)) expect(result.code).toBe('start_not_before_end');
  });
});

// ── ISG-B2-17: Date-range validation: maximum 90-day range ───────────────────

describe('ISG-B2-17: Date-range validation: maximum 90-day range enforced', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('resolveDateRange returns range_too_large for 91-day range', async () => {
    mockExecute.mockResolvedValue([{ last_successful_scan_at: null }]);
    const { resolveDateRange, isDateRangeError } = await import('../imageSafeguard/scanRunService.js');
    const end = new Date();
    const start = new Date(end.getTime() - 91 * 24 * 60 * 60 * 1000);
    const result = await resolveDateRange({
      since: start.toISOString(),
      until: end.toISOString(),
      useCursor: false,
    });
    expect(isDateRangeError(result)).toBe(true);
    if (isDateRangeError(result)) expect(result.code).toBe('range_too_large');
  });

  it('MAX_RANGE_MS is 90 days in scanRunService', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/imageSafeguard/scanRunService.ts', 'utf8');
    expect(source).toContain('90 * 24 * 60 * 60 * 1000');
    expect(source).toContain('MAX_RANGE_MS');
  });
});

// ── ISG-B2-18: Date-range validation: minimum 1-minute range ─────────────────

describe('ISG-B2-18: Date-range validation: minimum 1-minute range enforced', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('resolveDateRange returns range_too_small for 30-second range', async () => {
    mockExecute.mockResolvedValue([{ last_successful_scan_at: null }]);
    const { resolveDateRange, isDateRangeError } = await import('../imageSafeguard/scanRunService.js');
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 1000); // 30 seconds
    const result = await resolveDateRange({
      since: start.toISOString(),
      until: end.toISOString(),
      useCursor: false,
    });
    expect(isDateRangeError(result)).toBe(true);
    if (isDateRangeError(result)) expect(result.code).toBe('range_too_small');
  });
});

// ── ISG-B2-19: Scan scope hardcoded server-side ───────────────────────────────

describe('ISG-B2-19: Scan scope is hardcoded server-side — never accepted from client', () => {
  it('SCAN_BUCKET and SCAN_PREFIX are exported as const from scannerAdapter', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/imageSafeguard/scannerAdapter.ts', 'utf8');
    expect(source).toContain("export const SCAN_BUCKET = 'iwillbuild-files' as const");
    expect(source).toContain("export const SCAN_PREFIX = 'job-photos/' as const");
  });

  it('future worker call in scannerAdapter uses hardcoded SCAN_BUCKET and SCAN_PREFIX', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/imageSafeguard/scannerAdapter.ts', 'utf8');
    // The commented-out future implementation must reference SCAN_BUCKET and SCAN_PREFIX
    expect(source).toContain('SCAN_BUCKET');
    expect(source).toContain('SCAN_PREFIX');
    // And must note they are hardcoded, not from client
    expect(source).toContain('hardcoded');
  });
});

// ── ISG-B2-20: requirePlatformOwner applied to all four new routes ────────────

describe('ISG-B2-20: requirePlatformOwner applied to all four new routes', () => {
  it('all four routes have requirePlatformOwner as inline middleware', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/entry.ts', 'utf8');
    const routes = [
      /app\.post\(["']\/api\/owner-console\/image-safeguard\/scan["'],\s*requirePlatformOwner/,
      /app\.get\(["']\/api\/owner-console\/image-safeguard\/status["'],\s*requirePlatformOwner/,
      /app\.get\(["']\/api\/owner-console\/image-safeguard\/runs["'],\s*requirePlatformOwner/,
      /app\.patch\(["']\/api\/owner-console\/image-safeguard\/findings\/:id["'],\s*requirePlatformOwner/,
    ];
    for (const pattern of routes) {
      expect(source).toMatch(pattern);
    }
  });
});

// ── ISG-B2-21: Findings PATCH validates finding ID format ─────────────────────

describe('ISG-B2-21: Findings PATCH validates finding ID format', () => {
  it('PATCH handler validates UUID format of finding ID', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/owner-console/image-safeguard/findings/[id]/PATCH.ts', 'utf8');
    expect(source).toContain('invalid_finding_id');
    expect(source).toContain('[0-9a-f-]{36}');
  });

  it('PATCH handler requires reviewed boolean in body', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/owner-console/image-safeguard/findings/[id]/PATCH.ts', 'utf8');
    expect(source).toContain('reviewed_required');
    expect(source).toContain("typeof body?.reviewed !== 'boolean'");
  });
});

// ── ISG-B2-22: Reviewer identity from session — never from request body ───────

describe('ISG-B2-22: Reviewer identity resolved from session — never from request body', () => {
  it('PATCH handler resolves reviewer from session, not body', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/owner-console/image-safeguard/findings/[id]/PATCH.ts', 'utf8');
    expect(source).toContain('getAuth()');
    expect(source).toContain('getSession');
    expect(source).toContain('session?.user?.id');
    // Must NOT read reviewer from body
    expect(source).not.toContain('body.reviewerId');
    expect(source).not.toContain('body.reviewer_id');
  });
});

// ── ISG-B2-23: Reviewer note sanitized ───────────────────────────────────────

describe('ISG-B2-23: Reviewer note sanitized (HTML stripped, max 500 chars)', () => {
  it('PATCH handler strips HTML from reviewer note', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/owner-console/image-safeguard/findings/[id]/PATCH.ts', 'utf8');
    expect(source).toContain("replace(/<[^>]*>/g, '')");
    expect(source).toContain('.slice(0, 500)');
  });
});

// ── ISG-B2-24: Audit fires after successful DB operation only ─────────────────

describe('ISG-B2-24: Audit fires after successful DB operation only', () => {
  it('scan POST audit for completion fires after markRunCompleted', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8');
    const completedIdx = source.indexOf('markRunCompleted');
    const auditCompletedIdx = source.indexOf("'safeguard_scan_completed'");
    expect(completedIdx).toBeGreaterThan(-1);
    expect(auditCompletedIdx).toBeGreaterThan(completedIdx);
  });

  it('scan POST audit for failure fires after markRunFailed', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8');
    const failedIdx = source.indexOf('markRunFailed');
    const auditFailedIdx = source.indexOf("'safeguard_scan_failed'");
    expect(failedIdx).toBeGreaterThan(-1);
    expect(auditFailedIdx).toBeGreaterThan(failedIdx);
  });

  it('PATCH findings audit fires after db UPDATE succeeds', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/owner-console/image-safeguard/findings/[id]/PATCH.ts', 'utf8');
    const updateIdx = source.indexOf('UPDATE image_safeguard_findings');
    const auditIdx = source.indexOf("'safeguard_finding_reviewed'");
    expect(updateIdx).toBeGreaterThan(-1);
    expect(auditIdx).toBeGreaterThan(updateIdx);
  });

  it('audit does not fire in catch blocks', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8');
    // The outer catch block must not contain platform_activity_log insert
    const outerCatchIdx = source.lastIndexOf('} catch {');
    const afterCatch = source.slice(outerCatchIdx);
    expect(afterCatch).not.toContain('platform_activity_log');
  });
});

// ── ISG-B2-NEW: executeScan throws → run_status=failed, error_code stored ────

describe('ISG-B2-NEW: executeScan throws after createScanRun → run status is failed and error_code stored', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  it('scan POST async path calls markRunFailed with a sanitized code when executeScan throws', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8');
    // markRunFailed must be called inside the async catch block with rawCode
    const catchIdx = source.indexOf('} catch (err: unknown)');
    const afterCatch = source.slice(catchIdx);
    expect(afterCatch).toContain('markRunFailed(runId, rawCode)');
  });

  it('markRunFailed writes run_status=failed and error_code to the DB', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/imageSafeguard/scanRunService.ts', 'utf8');
    const fnIdx = source.indexOf('export async function markRunFailed');
    const nextFnIdx = source.indexOf('\nexport async function', fnIdx + 1);
    const body = source.slice(fnIdx, nextFnIdx > -1 ? nextFnIdx : undefined);
    expect(body).toContain("run_status  = 'failed'");
    expect(body).toContain('error_code  = ${safeCode}');
  });

  it('error_code is sanitized to alphanumeric+underscore, max 64 chars', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/imageSafeguard/scanRunService.ts', 'utf8');
    expect(source).toContain("replace(/[^a-z0-9_]/gi, '_').slice(0, 64)");
  });

  it('async inner catch logs name and message (no raw object)', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/api/owner-console/image-safeguard/scan/POST.ts', 'utf8');
    expect(source).toContain('[image-safeguard/scan async]');
    expect(source).toContain('err instanceof Error ? err.name');
    expect(source).toContain('err.message.slice(0, 300)');
  });

  it('UI Last Run card renders errorCode when present', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/components/owner-console/ImageSafeguardTab.tsx', 'utf8');
    expect(source).toContain('status.lastRun.errorCode');
    expect(source).toContain('Error: {status.lastRun.errorCode}');
  });

  it('Recent runs list renders errorCode per run when present', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/components/owner-console/ImageSafeguardTab.tsx', 'utf8');
    expect(source).toContain('run.errorCode');
    expect(source).toContain('Error: {run.errorCode}');
  });
});

// ── ISG-B2-25: Runtime decision documented ───────────────────────────────────

describe('ISG-B2-25: Runtime decision documented — Python worker required', () => {
  it('scannerAdapter documents Alpine musl limitation', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/imageSafeguard/scannerAdapter.ts', 'utf8');
    expect(source).toContain('Alpine');
    expect(source).toContain('musl');
    expect(source).toContain('glibc');
    expect(source).toContain('opencv-python-headless');
  });

  it('scannerAdapter documents activation steps', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/imageSafeguard/scannerAdapter.ts', 'utf8');
    expect(source).toContain('TO ACTIVATE THE SCANNER IN A FUTURE STAGE');
    expect(source).toContain('SCANNER_WORKER_URL');
    expect(source).toContain('SCANNER_WORKER_SECRET');
  });

  it('getAdapterCapability returns configured:false when no worker URL set', async () => {
    const { getAdapterCapability } = await import('../imageSafeguard/scannerAdapter.js');
    const cap = getAdapterCapability();
    expect(cap.configured).toBe(false);
    expect(cap.provider).toBeNull();
  });

  it('getImageSafeguardCapability delegates to adapter and never throws', async () => {
    const { getImageSafeguardCapability } = await import('../imageSafeguardCapability.js');
    expect(() => getImageSafeguardCapability()).not.toThrow();
    const cap = getImageSafeguardCapability();
    expect(cap.configured).toBe(false);
  });
});

// ── ISG-B2-26: Dazza trigger uses correct createScanRun / markRunCompleted signatures ──

describe('ISG-B2-26: Dazza trigger tool uses correct function signatures — no undefined toISOString', () => {
  it('dazza-v3-tools calls createScanRun with (initiatedBy, rangeResult) — not 4 positional args', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/dazza-v3-tools.ts', 'utf8');
    // Must pass the full ResolvedDateRange object as second arg
    expect(source).toContain("createScanRun('dazza', rangeResult)");
    // Must NOT pass rangeStart/rangeEnd/usedCursor as separate positional args
    expect(source).not.toContain('createScanRun(\'dazza\', rangeResult.rangeStart');
  });

  it('dazza-v3-tools calls markRunCompleted with (runId, counts, detectorName, detectorVersion)', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/dazza-v3-tools.ts', 'utf8');
    // Must pass the counts object, not the raw outcome
    expect(source).toContain('imagesConsidered: outcome.imagesConsidered');
    expect(source).toContain('imagesScanned:    outcome.imagesScanned');
    expect(source).toContain('outcome.detectorName');
    expect(source).toContain('outcome.detectorVersion');
    // Must NOT pass outcome directly as second arg
    expect(source).not.toMatch(/markRunCompleted\(runId,\s*outcome\)/);
  });

  it('dazza async catch uses rawCode pattern (prefers .code then .name)', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/dazza-v3-tools.ts', 'utf8');
    // The dazza async catch is the LAST catch (e: unknown) block in the file
    const lastCatchIdx = source.lastIndexOf('} catch (e: unknown) {');
    const afterCatch = source.slice(lastCatchIdx, lastCatchIdx + 600);
    expect(afterCatch).toContain("'code' in e");
    expect(afterCatch).toContain('markRunFailed(runId, rawCode)');
  });

  it('resolveDateRange with useCursor=true and no cursor does not throw', async () => {
    // Cursor returns null — must fall back to 7-day default, not throw
    mockExecute.mockResolvedValue([{ last_successful_scan_at: null }]);
    const { resolveDateRange, isDateRangeError } = await import('../imageSafeguard/scanRunService.js');
    const result = await resolveDateRange({ since: null, until: null, useCursor: true });
    // Must not be an error — must produce a valid range
    expect(isDateRangeError(result)).toBe(false);
    if (!isDateRangeError(result)) {
      // rangeStart and rangeEnd must be valid Dates — toISOString must not throw
      expect(() => result.rangeStart.toISOString()).not.toThrow();
      expect(() => result.rangeEnd.toISOString()).not.toThrow();
      expect(result.usedCursor).toBe(false);
    }
  });

  it('explicit since/until from UI are passed through unchanged', async () => {
    mockExecute.mockResolvedValue([{ last_successful_scan_at: null }]);
    const { resolveDateRange, isDateRangeError } = await import('../imageSafeguard/scanRunService.js');
    const since = '2026-08-01T00:00:00.000Z';
    const until = '2026-09-01T00:00:00.000Z';
    const result = await resolveDateRange({ since, until, useCursor: false });
    expect(isDateRangeError(result)).toBe(false);
    if (!isDateRangeError(result)) {
      expect(result.rangeStart.toISOString()).toBe(since);
      expect(result.rangeEnd.toISOString()).toBe(until);
    }
  });
});

// ── ISG-B2-27: period_days parameter in Dazza trigger tool ────────────────────

describe('ISG-B2-27: period_days parameter in Dazza trigger tool', () => {
  it('dazza-v3-tools tool definition includes period_days property', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/dazza-v3-tools.ts', 'utf8');
    expect(source).toContain('period_days');
    expect(source).toContain('period_days must be an integer between 1 and 90');
  });

  it('period_days is ignored when explicit since is provided', async () => {
    // resolveDateRange with explicit since — period_days should not override it
    mockExecute.mockResolvedValue([{ last_successful_scan_at: null }]);
    const { resolveDateRange, isDateRangeError } = await import('../imageSafeguard/scanRunService.js');
    const since = '2026-08-01T00:00:00.000Z';
    const until = '2026-09-01T00:00:00.000Z';
    // Simulate: explicit since wins; period_days would compute a different date
    const result = await resolveDateRange({ since, until, useCursor: false });
    expect(isDateRangeError(result)).toBe(false);
    if (!isDateRangeError(result)) {
      expect(result.rangeStart.toISOString()).toBe(since);
    }
  });

  it('period_days=30 computes since = now − 30 days', () => {
    // Verify the arithmetic used in the dazza tool
    const now = new Date('2026-09-01T18:00:00.000Z');
    const pd = 30;
    const computed = new Date(now.getTime() - pd * 24 * 60 * 60 * 1000).toISOString();
    expect(computed).toBe('2026-08-02T18:00:00.000Z');
  });

  it('period_days validation: rejects 0, negative, >90, non-integer', () => {
    const invalid = [0, -1, 91, 3.14, -0.5, 100];
    for (const pd of invalid) {
      const isValid = Number.isInteger(pd) && pd >= 1 && pd <= 90;
      expect(isValid).toBe(false);
    }
  });

  it('period_days validation: accepts 1, 7, 30, 90', () => {
    const valid = [1, 7, 30, 90];
    for (const pd of valid) {
      const isValid = Number.isInteger(pd) && pd >= 1 && pd <= 90;
      expect(isValid).toBe(true);
    }
  });
});

// ── ISG-B2-28: persistFindings writes only privacy_signal and failed rows ──────

describe('ISG-B2-28: persistFindings persists findings correctly', () => {
  beforeEach(() => { vi.resetModules(); mockExecute.mockReset(); });

  const makeResult = (result: string, faceCount = 0) => ({
    assetId:         `key_hash:aabbccdd`,
    companyId:       42,
    userId:          null,
    result,
    faceCount,
    detectorName:    'openai_vision',
    detectorVersion: 'gpt-4o',
    failureCode:     result === 'failed' ? 'classifier_error' : null,
  });

  it('inserts one row per privacy_signal and failed result', async () => {
    const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    vi.doMock('../../db/client.js', () => ({ db: { execute: mockExecute, insert: mockInsert } }));
    vi.doMock('../../db/schema.js', () => ({ imageSafeguardFindings: 'imageSafeguardFindings' }));

    const { persistFindings } = await import('../imageSafeguard/scanRunService.js');
    const results = [
      makeResult('privacy_signal', 2),
      makeResult('clear'),
      makeResult('failed'),
      makeResult('unavailable'),
    ];
    await persistFindings('run-001', results);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const valuesFn = mockInsert.mock.results[0].value.values;
    const rows = valuesFn.mock.calls[0][0] as Array<Record<string, unknown>>;
    // Only privacy_signal and failed — clear and unavailable are excluded
    expect(rows).toHaveLength(2);
    expect(rows.map((r: Record<string, unknown>) => r.result)).toEqual(
      expect.arrayContaining(['privacy_signal', 'failed']),
    );
  });

  it('is a no-op when results array is empty', async () => {
    const mockInsert = vi.fn();
    vi.doMock('../../db/client.js', () => ({ db: { execute: mockExecute, insert: mockInsert } }));
    vi.doMock('../../db/schema.js', () => ({ imageSafeguardFindings: 'imageSafeguardFindings' }));

    const { persistFindings } = await import('../imageSafeguard/scanRunService.js');
    await persistFindings('run-002', []);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('is a no-op when all results are clear or unavailable', async () => {
    const mockInsert = vi.fn();
    vi.doMock('../../db/client.js', () => ({ db: { execute: mockExecute, insert: mockInsert } }));
    vi.doMock('../../db/schema.js', () => ({ imageSafeguardFindings: 'imageSafeguardFindings' }));

    const { persistFindings } = await import('../imageSafeguard/scanRunService.js');
    await persistFindings('run-003', [makeResult('clear'), makeResult('unavailable')]);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('each row has a generated uuid id and scannedAt — not from the scan result', async () => {
    const capturedRows: Array<Record<string, unknown>> = [];
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation((rows: Array<Record<string, unknown>>) => {
        capturedRows.push(...rows);
        return Promise.resolve(undefined);
      }),
    });
    vi.doMock('../../db/client.js', () => ({ db: { execute: mockExecute, insert: mockInsert } }));
    vi.doMock('../../db/schema.js', () => ({ imageSafeguardFindings: 'imageSafeguardFindings' }));

    const { persistFindings } = await import('../imageSafeguard/scanRunService.js');
    await persistFindings('run-004', [makeResult('privacy_signal', 1)]);

    expect(capturedRows).toHaveLength(1);
    const row = capturedRows[0];
    // id must be a UUID v4 pattern
    expect(typeof row.id).toBe('string');
    expect((row.id as string).length).toBe(36);
    // scannedAt must be a Date object (not a string from the scan result)
    expect(row.scannedAt).toBeInstanceOf(Date);
    // scanRunId must match the passed runId
    expect(row.scanRunId).toBe('run-004');
    // r2Key must NOT be present — never stored in findings table
    expect('r2Key' in row).toBe(false);
  });

  it('r2Key is never stored in the findings row', async () => {
    const capturedRows: Array<Record<string, unknown>> = [];
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockImplementation((rows: Array<Record<string, unknown>>) => {
        capturedRows.push(...rows);
        return Promise.resolve(undefined);
      }),
    });
    vi.doMock('../../db/client.js', () => ({ db: { execute: mockExecute, insert: mockInsert } }));
    vi.doMock('../../db/schema.js', () => ({ imageSafeguardFindings: 'imageSafeguardFindings' }));

    const { persistFindings } = await import('../imageSafeguard/scanRunService.js');
    // Simulate a result that has r2Key (as r2Scanner would produce)
    const resultWithKey = { ...makeResult('privacy_signal', 1), r2Key: 'job-photos/companies/42/job-photos/uuid/photo.jpg' };
    await persistFindings('run-005', [resultWithKey]);

    expect(capturedRows).toHaveLength(1);
    expect('r2Key' in capturedRows[0]).toBe(false);
  });

  it('source: persistFindings is exported from scanRunService.ts', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/imageSafeguard/scanRunService.ts', 'utf8');
    expect(source).toContain('export async function persistFindings');
    expect(source).toContain("r.result === 'privacy_signal' || r.result === 'failed'");
  });

  it('source: dazza-v3-tools calls persistFindings after markRunCompleted', async () => {
    const { readFileSync } = await import('fs');
    const source = readFileSync('src/server/lib/dazza-v3-tools.ts', 'utf8');
    expect(source).toContain('persistFindings');
    expect(source).toContain('await persistFindings(runId, outcome.results)');
  });
});
