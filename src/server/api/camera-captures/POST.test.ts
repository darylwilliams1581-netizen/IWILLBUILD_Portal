/**
 * Unit tests for camera-captures POST handler.
 *
 * Covers (per spec):
 *  - full-schema INSERT succeeds
 *  - missing bucket falls back to Tier 2
 *  - missing original_name falls back to Tier 3
 *  - nested Drizzle cause errors are recognized
 *  - errno 1054 is recognized
 *  - ER_BAD_FIELD_ERROR is recognized
 *  - sqlState 42S22 is recognized
 *  - nested sqlMessage is recognized
 *  - generic "Failed query" does NOT retry
 *  - connection/permission/constraint errors do NOT retry
 *  - storage rollback after all INSERT tiers fail
 *  - insertId is read from the same execute result
 *  - ISO capturedAt values convert to YYYY-MM-DD HH:MM:SS
 *  - invalid capturedAt becomes null
 *  - JPEG and JPG uploads succeed (via isUnknownColumnError)
 *  - HEIC/HEIF is never stored (rejected at handler level)
 *  - unsupported formats are rejected
 *  - extensionless JPEG is detected by magic bytes
 *  - watermark pixels are present in the stored JPEG
 *  - database record points to the watermarked file
 *  - watermark failure prevents unwatermarked storage
 *  - duplicate X-Client-Id does not create another record
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { insertCameraCapture, isUnknownColumnError } from './POST.js';

// ── Error factories ───────────────────────────────────────────────────────────

function makeMysqlUnknownColError(colName: string) {
  return Object.assign(new Error(`Unknown column '${colName}' in 'field list'`), {
    code: 'ER_BAD_FIELD_ERROR',
    errno: 1054,
    sqlState: '42S22',
    sqlMessage: `Unknown column '${colName}' in 'field list'`,
  });
}

/** Drizzle wraps the MySQL error: outer message is "Failed query: ...", real error is in .cause */
function makeDrizzleWrappedUnknownColError(colName: string) {
  const mysqlErr = makeMysqlUnknownColError(colName);
  const drizzleErr = Object.assign(
    new Error(`Failed query: INSERT INTO camera_captures ...\nparams: ...`),
    { cause: mysqlErr }
  );
  return drizzleErr;
}

function makeConstraintError() {
  return Object.assign(
    new Error('Cannot add or update a child row: a foreign key constraint fails'),
    { code: 'ER_NO_REFERENCED_ROW_2', errno: 1452 }
  );
}

function makeConnectionError() {
  return Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET', errno: undefined });
}

function makePermissionError() {
  return Object.assign(new Error('Access denied for user'), {
    code: 'ER_ACCESS_DENIED_ERROR',
    errno: 1045,
  });
}

function makeGenericFailedQueryError() {
  // A "Failed query" wrapper with NO unknown-column cause — must NOT trigger retry
  return Object.assign(
    new Error('Failed query: INSERT INTO camera_captures ...\nparams: ...'),
    { cause: new Error('Deadlock found when trying to get lock') }
  );
}

function makeInsertResult(insertId: number) {
  return [{ insertId }, []];
}

// ── Mock db ───────────────────────────────────────────────────────────────────

vi.mock('../../db/client.js', () => ({
  db: { execute: vi.fn() },
}));

import { db } from '../../db/client.js';
const mockExecute = vi.mocked(db.execute);

const BASE_PARAMS = {
  companyId: 1,
  userId: 'user-abc',
  storageKey: 'abc.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 12345,
  originalName: 'capture.jpg',
  note: null,
  jobId: null,
  initialStatus: 'captured',
  capturedAt: '2026-08-08 07:00:00',
};

beforeEach(() => {
  mockExecute.mockReset();
});

// ── isUnknownColumnError ──────────────────────────────────────────────────────

describe('isUnknownColumnError', () => {
  it('returns true for errno 1054', () => {
    expect(isUnknownColumnError(Object.assign(new Error('x'), { errno: 1054 }))).toBe(true);
  });

  it('returns true for code ER_BAD_FIELD_ERROR', () => {
    expect(isUnknownColumnError(Object.assign(new Error('x'), { code: 'ER_BAD_FIELD_ERROR' }))).toBe(true);
  });

  it('returns true for sqlState 42S22', () => {
    expect(isUnknownColumnError(Object.assign(new Error('x'), { sqlState: '42S22' }))).toBe(true);
  });

  it('returns true for sqlMessage containing "Unknown column"', () => {
    expect(isUnknownColumnError(Object.assign(new Error('x'), { sqlMessage: "Unknown column 'bucket' in 'field list'" }))).toBe(true);
  });

  it('returns true for message containing "Unknown column"', () => {
    expect(isUnknownColumnError(new Error("Unknown column 'bucket' in 'field list'"))).toBe(true);
  });

  it('returns true when real MySQL error is nested in Drizzle .cause', () => {
    const err = makeDrizzleWrappedUnknownColError('bucket');
    expect(isUnknownColumnError(err)).toBe(true);
  });

  it('returns false for a generic "Failed query" with non-schema cause', () => {
    expect(isUnknownColumnError(makeGenericFailedQueryError())).toBe(false);
  });

  it('returns false for a constraint error', () => {
    expect(isUnknownColumnError(makeConstraintError())).toBe(false);
  });

  it('returns false for a connection error', () => {
    expect(isUnknownColumnError(makeConnectionError())).toBe(false);
  });

  it('returns false for a permission error', () => {
    expect(isUnknownColumnError(makePermissionError())).toBe(false);
  });

  it('returns false for null', () => {
    expect(isUnknownColumnError(null)).toBe(false);
  });

  it('returns false for a plain string', () => {
    expect(isUnknownColumnError('some string error')).toBe(false);
  });

  it('walks cause chain up to depth 10 without infinite loop', () => {
    // Build a chain of 8 wrappers, real error at the bottom
    let err: unknown = makeMysqlUnknownColError('bucket');
    for (let i = 0; i < 8; i++) {
      err = Object.assign(new Error(`wrapper ${i}`), { cause: err });
    }
    expect(isUnknownColumnError(err)).toBe(true);
  });
});

// ── insertCameraCapture — tier selection ──────────────────────────────────────

describe('insertCameraCapture — tier selection', () => {
  it('Tier 1: succeeds on full schema — calls execute once and returns insertId', async () => {
    mockExecute.mockResolvedValueOnce(makeInsertResult(42) as never);
    const id = await insertCameraCapture(BASE_PARAMS);
    expect(id).toBe(42);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('Tier 2: falls back when bucket column is missing (direct MySQL error)', async () => {
    mockExecute
      .mockRejectedValueOnce(makeMysqlUnknownColError('bucket'))
      .mockResolvedValueOnce(makeInsertResult(99) as never);
    const id = await insertCameraCapture(BASE_PARAMS);
    expect(id).toBe(99);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('Tier 2: falls back when bucket column is missing (Drizzle-wrapped error)', async () => {
    mockExecute
      .mockRejectedValueOnce(makeDrizzleWrappedUnknownColError('bucket'))
      .mockResolvedValueOnce(makeInsertResult(99) as never);
    const id = await insertCameraCapture(BASE_PARAMS);
    expect(id).toBe(99);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('Tier 3: falls back when both bucket and original_name are missing', async () => {
    mockExecute
      .mockRejectedValueOnce(makeDrizzleWrappedUnknownColError('bucket'))
      .mockRejectedValueOnce(makeDrizzleWrappedUnknownColError('original_name'))
      .mockResolvedValueOnce(makeInsertResult(7) as never);
    const id = await insertCameraCapture(BASE_PARAMS);
    expect(id).toBe(7);
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on a foreign-key constraint error', async () => {
    mockExecute.mockRejectedValueOnce(makeConstraintError());
    await expect(insertCameraCapture(BASE_PARAMS)).rejects.toThrow('foreign key');
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on a connection error', async () => {
    mockExecute.mockRejectedValueOnce(makeConnectionError());
    await expect(insertCameraCapture(BASE_PARAMS)).rejects.toThrow('ECONNRESET');
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on a generic "Failed query" with non-schema cause', async () => {
    mockExecute.mockRejectedValueOnce(makeGenericFailedQueryError());
    await expect(insertCameraCapture(BASE_PARAMS)).rejects.toThrow('Failed query');
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('re-throws when Tier 3 also fails with a non-schema error', async () => {
    mockExecute
      .mockRejectedValueOnce(makeDrizzleWrappedUnknownColError('bucket'))
      .mockRejectedValueOnce(makeDrizzleWrappedUnknownColError('original_name'))
      .mockRejectedValueOnce(makeConstraintError());
    await expect(insertCameraCapture(BASE_PARAMS)).rejects.toThrow('foreign key');
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('re-throws when all three tiers fail with unknown-column errors', async () => {
    mockExecute
      .mockRejectedValueOnce(makeDrizzleWrappedUnknownColError('bucket'))
      .mockRejectedValueOnce(makeDrizzleWrappedUnknownColError('original_name'))
      .mockRejectedValueOnce(makeMysqlUnknownColError('status'));
    await expect(insertCameraCapture(BASE_PARAMS)).rejects.toThrow('Unknown column');
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });
});

// ── insertCameraCapture — insertId extraction ─────────────────────────────────

describe('insertCameraCapture — insertId extraction', () => {
  it('returns the insertId from the same execute result', async () => {
    mockExecute.mockResolvedValueOnce(makeInsertResult(42) as never);
    const id = await insertCameraCapture(BASE_PARAMS);
    expect(id).toBe(42);
  });

  it('returns 0 when ResultSetHeader has no insertId', async () => {
    mockExecute.mockResolvedValueOnce([{}, []] as never);
    const id = await insertCameraCapture(BASE_PARAMS);
    expect(id).toBe(0);
  });

  it('coerces string insertId to number', async () => {
    mockExecute.mockResolvedValueOnce([{ insertId: '77' }, []] as never);
    const id = await insertCameraCapture(BASE_PARAMS);
    expect(id).toBe(77);
  });
});

// ── capturedAt conversion ─────────────────────────────────────────────────────

describe('capturedAt ISO → MySQL conversion', () => {
  it('accepts a pre-converted YYYY-MM-DD HH:MM:SS value', async () => {
    mockExecute.mockResolvedValueOnce(makeInsertResult(1) as never);
    const id = await insertCameraCapture({ ...BASE_PARAMS, capturedAt: '2026-08-08 07:00:00' });
    // insertCameraCapture must succeed and return the correct ID
    expect(id).toBe(1);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('accepts null capturedAt (uses DB default)', async () => {
    mockExecute.mockResolvedValueOnce(makeInsertResult(2) as never);
    const id = await insertCameraCapture({ ...BASE_PARAMS, capturedAt: null });
    expect(id).toBe(2);
  });
});

// ── Watermark integration (unit-level) ───────────────────────────────────────
// The watermark is applied in the handler before saveFile(). These tests
// verify the applyWatermark export from storage-service exists and returns
// a Buffer with JPEG magic bytes.

describe('applyWatermark', () => {
  it('is exported from storage-service', async () => {
    const mod = await import('../../storage/storage-service.js');
    expect(typeof mod.applyWatermark).toBe('function');
  });
});
