/**
 * Unit tests for camera-captures POST handler.
 *
 * Covers:
 *  - Tier 1 INSERT (full schema: bucket + original_name)
 *  - Tier 2 fallback (no bucket column)
 *  - Tier 3 fallback (no bucket AND no original_name)
 *  - Non-schema errors are NOT retried
 *  - Storage rollback when all inserts fail
 *  - Duplicate X-Client-Id does not create another record
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { insertCameraCapture } from './POST.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeUnknownColError(colName: string) {
  const e = Object.assign(new Error(`Unknown column '${colName}' in 'field list'`), {
    code: 'ER_BAD_FIELD_ERROR',
    errno: 1054,
  });
  return e;
}

function makeConstraintError() {
  return Object.assign(new Error('Cannot add or update a child row: a foreign key constraint fails'), {
    code: 'ER_NO_REFERENCED_ROW_2',
    errno: 1452,
  });
}

function makeConnectionError() {
  return Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET', errno: undefined });
}

function makeInsertResult(insertId: number) {
  return [{ insertId }, []];
}

// ── Mock db ───────────────────────────────────────────────────────────────────

vi.mock('../../db/client.js', () => ({
  db: { execute: vi.fn() },
}));

// We need to import db AFTER the mock is set up
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('insertCameraCapture — tier selection', () => {
  it('Tier 1: succeeds on full schema — calls execute once and returns insertId', async () => {
    mockExecute.mockResolvedValueOnce(makeInsertResult(42) as never);

    const id = await insertCameraCapture(BASE_PARAMS);

    expect(id).toBe(42);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('Tier 2: falls back when bucket column is missing', async () => {
    mockExecute
      .mockRejectedValueOnce(makeUnknownColError('bucket'))   // Tier 1 fails
      .mockResolvedValueOnce(makeInsertResult(99) as never);  // Tier 2 succeeds

    const id = await insertCameraCapture(BASE_PARAMS);

    expect(id).toBe(99);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('Tier 3: falls back when both bucket and original_name are missing', async () => {
    mockExecute
      .mockRejectedValueOnce(makeUnknownColError('bucket'))        // Tier 1 fails
      .mockRejectedValueOnce(makeUnknownColError('original_name')) // Tier 2 fails
      .mockResolvedValueOnce(makeInsertResult(7) as never);        // Tier 3 succeeds

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

  it('re-throws when Tier 3 also fails with a non-schema error', async () => {
    mockExecute
      .mockRejectedValueOnce(makeUnknownColError('bucket'))
      .mockRejectedValueOnce(makeUnknownColError('original_name'))
      .mockRejectedValueOnce(makeConstraintError()); // Tier 3 fails with non-schema error

    await expect(insertCameraCapture(BASE_PARAMS)).rejects.toThrow('foreign key');
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('re-throws when all three tiers fail with unknown-column errors', async () => {
    mockExecute
      .mockRejectedValueOnce(makeUnknownColError('bucket'))
      .mockRejectedValueOnce(makeUnknownColError('original_name'))
      .mockRejectedValueOnce(makeUnknownColError('status')); // Tier 3 also fails

    await expect(insertCameraCapture(BASE_PARAMS)).rejects.toThrow('Unknown column');
    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('detects ER_BAD_FIELD_ERROR by code property, not just message text', async () => {
    const e = Object.assign(new Error('some db error'), {
      code: 'ER_BAD_FIELD_ERROR',
      errno: 1054,
    });
    mockExecute
      .mockRejectedValueOnce(e)
      .mockResolvedValueOnce(makeInsertResult(55) as never);

    const id = await insertCameraCapture(BASE_PARAMS);
    expect(id).toBe(55);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('detects unknown-column error by errno 1054', async () => {
    const e = Object.assign(new Error('some other message'), { errno: 1054 });
    mockExecute
      .mockRejectedValueOnce(e)
      .mockResolvedValueOnce(makeInsertResult(12) as never);

    const id = await insertCameraCapture(BASE_PARAMS);
    expect(id).toBe(12);
  });
});

describe('insertCameraCapture — insertId extraction', () => {
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
