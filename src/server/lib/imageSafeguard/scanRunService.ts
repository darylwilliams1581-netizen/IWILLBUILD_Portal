/**
 * scanRunService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B2 — Scan run lifecycle, cursor management, and date-range validation.
 *
 * SECURITY RULES:
 *  - Never returns R2 keys, signed URLs, image bytes, or internal paths.
 *  - Cursor is only advanced after a run completes successfully.
 *  - Failed, partial, cancelled, or timed-out runs do not advance the cursor.
 *  - Date-range validation is server-side only — never trusts client values blindly.
 *  - Maximum range enforced to prevent runaway scans.
 *  - Only one active run at a time (checked before creating a new run).
 *
 * SCAN SCOPE:
 *  - Bucket: iwillbuild-files (enforced in scannerAdapter.ts)
 *  - Prefix: job-photos/ (enforced in scannerAdapter.ts)
 *  - These are never accepted from the client.
 */

import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { imageSafeguardFindings } from '../../db/schema.js';
import type { ImageScanResult } from './scannerAdapter.js';

// ── MySQL datetime helper ─────────────────────────────────────────────────────
/**
 * Converts a Date to the 'YYYY-MM-DD HH:MM:SS' format required by MySQL
 * DATETIME columns. MySQL rejects ISO 8601 strings with a 'T' separator
 * and 'Z' suffix (e.g. '2026-09-01T17:02:06.564Z').
 */
function toMySQLDatetime(d: Date): string {
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default lookback when no cursor exists: 7 days. */
const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/** Maximum allowed date range: 90 days. */
const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000;

/** Minimum allowed date range: 1 minute. */
const MIN_RANGE_MS = 60 * 1000;

// ── Types ─────────────────────────────────────────────────────────────────────

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ScanRunRecord {
  id: string;
  initiatedBy: string;
  rangeStart: string;
  rangeEnd: string;
  usedCursor: boolean;
  runStatus: RunStatus;
  imagesConsidered: number;
  imagesScanned: number;
  imagesSkipped: number;
  imagesWithSignal: number;
  imagesFailed: number;
  detectorName: string | null;
  detectorVersion: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  errorCode: string | null;
}

export interface DateRangeRequest {
  /** ISO-8601 string or null to use cursor/default. */
  since: string | null;
  /** ISO-8601 string or null to use server now. */
  until: string | null;
  /** If true, use the last successful scan cursor as `since`. */
  useCursor: boolean;
}

export interface ResolvedDateRange {
  rangeStart: Date;
  rangeEnd: Date;
  usedCursor: boolean;
}

export interface DateRangeValidationError {
  code: string;
  message: string;
}

// ── Cursor ────────────────────────────────────────────────────────────────────

/**
 * Returns the last successful scan timestamp, or null if none exists.
 * Never throws — returns null on any DB error.
 */
export async function getLastSuccessfulScanAt(): Promise<Date | null> {
  try {
    const rows = await db.execute(sql`
      SELECT last_successful_scan_at FROM image_safeguard_scan_cursor WHERE id = 1
    `);
    const row = (rows as unknown as Array<{ last_successful_scan_at: string | null }>)[0];
    if (!row?.last_successful_scan_at) return null;
    const d = new Date(row.last_successful_scan_at);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Advances the cursor to `completedAt` after a successful run.
 * Only called when a run completes successfully — never on failure.
 */
export async function advanceCursor(runId: string, completedAt: Date): Promise<void> {
  await db.execute(sql`
    UPDATE image_safeguard_scan_cursor
    SET last_successful_scan_at = ${toMySQLDatetime(completedAt)},
        last_successful_run_id  = ${runId}
    WHERE id = 1
  `);
}

// ── Date-range resolution ─────────────────────────────────────────────────────

/**
 * Resolves and validates a date-range request into concrete UTC Date objects.
 * Returns a validation error if the range is invalid.
 *
 * Rules:
 *  - `until` defaults to server now.
 *  - `since` defaults to last successful scan cursor, or 7 days ago if no cursor.
 *  - If `useCursor` is true, `since` is overridden with the cursor value.
 *  - start must be before end.
 *  - Range must not exceed MAX_RANGE_MS (90 days).
 *  - Range must be at least MIN_RANGE_MS (1 minute).
 *  - All parsing is server-side — client values are validated, not trusted.
 */
export async function resolveDateRange(
  req: DateRangeRequest,
): Promise<ResolvedDateRange | DateRangeValidationError> {
  const now = new Date();

  // Resolve `until`
  let rangeEnd: Date;
  if (req.until) {
    rangeEnd = new Date(req.until);
    if (isNaN(rangeEnd.getTime())) {
      return { code: 'invalid_until', message: 'Invalid until date.' };
    }
    // Must not be in the future by more than 5 minutes (clock skew tolerance)
    if (rangeEnd.getTime() > now.getTime() + 5 * 60 * 1000) {
      return { code: 'until_in_future', message: 'Until date cannot be in the future.' };
    }
  } else {
    rangeEnd = now;
  }

  // Resolve `since`
  let rangeStart: Date;
  let usedCursor = false;

  if (req.useCursor) {
    const cursor = await getLastSuccessfulScanAt();
    if (cursor) {
      rangeStart = cursor;
      usedCursor = true;
    } else {
      // No cursor — fall back to 7 days
      rangeStart = new Date(rangeEnd.getTime() - DEFAULT_LOOKBACK_MS);
      usedCursor = false;
    }
  } else if (req.since) {
    rangeStart = new Date(req.since);
    if (isNaN(rangeStart.getTime())) {
      return { code: 'invalid_since', message: 'Invalid since date.' };
    }
  } else {
    // No since provided — use cursor or 7-day default
    const cursor = await getLastSuccessfulScanAt();
    if (cursor) {
      rangeStart = cursor;
      usedCursor = true;
    } else {
      rangeStart = new Date(rangeEnd.getTime() - DEFAULT_LOOKBACK_MS);
    }
  }

  // Validate ordering
  if (rangeStart >= rangeEnd) {
    return { code: 'start_not_before_end', message: 'Start date must be before end date.' };
  }

  // Validate minimum range
  const rangeMs = rangeEnd.getTime() - rangeStart.getTime();
  if (rangeMs < MIN_RANGE_MS) {
    return { code: 'range_too_small', message: 'Date range must be at least 1 minute.' };
  }

  // Validate maximum range
  if (rangeMs > MAX_RANGE_MS) {
    return {
      code: 'range_too_large',
      message: `Date range cannot exceed 90 days. Requested: ${Math.ceil(rangeMs / 86400000)} days.`,
    };
  }

  return { rangeStart, rangeEnd, usedCursor };
}

export function isDateRangeError(
  v: ResolvedDateRange | DateRangeValidationError,
): v is DateRangeValidationError {
  return 'code' in v && 'message' in v;
}

// ── Active run guard ──────────────────────────────────────────────────────────

/**
 * Returns true if a run is currently in `pending` or `running` state.
 * Used to prevent overlapping scans.
 */
/**
 * Sentinel error thrown by hasActiveRun when the schema is not ready.
 * Caught by the outer handler in scan/POST.ts and mapped to 503 schema_not_ready.
 */
export class SchemaNotReadyError extends Error {
  readonly code = 'schema_not_ready';
  constructor(cause: unknown) {
    super('Image Safeguard schema is not ready');
    this.name = 'SchemaNotReadyError';
    if (cause instanceof Error) this.stack = cause.stack;
  }
}

/** Returns true if the error message indicates a missing table (schema not yet created). */
function isMissingTableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /table.*doesn'?t exist/i.test(msg) ||
    /no such table/i.test(msg) ||
    /relation.*does not exist/i.test(msg) ||
    /ER_NO_SUCH_TABLE/i.test(msg)
  );
}

export async function hasActiveRun(): Promise<boolean> {
  try {
    const rows = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM image_safeguard_scan_runs
      WHERE run_status IN ('pending', 'running')
    `);
    const cnt = Number((rows as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0);
    return cnt > 0;
  } catch (err) {
    // Missing-table errors must surface as schema_not_ready (503), not as
    // "scan already running" (409). Re-throw so the outer handler can classify.
    if (isMissingTableError(err)) {
      throw new SchemaNotReadyError(err);
    }
    // Lock timeouts, network errors, auth errors: fail closed (assume active)
    // to prevent overlapping runs. The outer handler maps this to 500.
    return true;
  }
}

// ── Run lifecycle ─────────────────────────────────────────────────────────────

/** Creates a new scan run record in `pending` state. */
export async function createScanRun(
  initiatedBy: string,
  range: ResolvedDateRange,
): Promise<string> {
  const id = randomUUID();
  const now = toMySQLDatetime(new Date());
  await db.execute(sql`
    INSERT INTO image_safeguard_scan_runs
      (id, initiated_by, range_start, range_end, used_cursor, run_status, created_at)
    VALUES
      (${id}, ${initiatedBy}, ${toMySQLDatetime(range.rangeStart)},
       ${toMySQLDatetime(range.rangeEnd)}, ${range.usedCursor ? 1 : 0},
       'pending', ${now})
  `);
  return id;
}

/** Transitions a run to `running` and records `started_at`. */
export async function markRunStarted(runId: string): Promise<void> {
  await db.execute(sql`
    UPDATE image_safeguard_scan_runs
    SET run_status = 'running', started_at = ${toMySQLDatetime(new Date())}
    WHERE id = ${runId}
  `);
}

/** Transitions a run to `completed` and records final counts + `finished_at`. */
export async function markRunCompleted(
  runId: string,
  counts: {
    imagesConsidered: number;
    imagesScanned: number;
    imagesSkipped: number;
    imagesWithSignal: number;
    imagesFailed: number;
  },
  detectorName: string,
  detectorVersion: string,
): Promise<void> {
  const now = toMySQLDatetime(new Date());
  await db.execute(sql`
    UPDATE image_safeguard_scan_runs
    SET run_status        = 'completed',
        finished_at       = ${now},
        images_considered = ${counts.imagesConsidered},
        images_scanned    = ${counts.imagesScanned},
        images_skipped    = ${counts.imagesSkipped},
        images_with_signal= ${counts.imagesWithSignal},
        images_failed     = ${counts.imagesFailed},
        detector_name     = ${detectorName},
        detector_version  = ${detectorVersion}
    WHERE id = ${runId}
  `);
}

/**
 * Transitions a run to `failed` with a sanitized error code.
 * Does NOT advance the cursor.
 */
export async function markRunFailed(runId: string, errorCode: string): Promise<void> {
  // Sanitize: only alphanumeric + underscore, max 64 chars
  const safeCode = errorCode.replace(/[^a-z0-9_]/gi, '_').slice(0, 64);
  await db.execute(sql`
    UPDATE image_safeguard_scan_runs
    SET run_status  = 'failed',
        finished_at = ${toMySQLDatetime(new Date())},
        error_code  = ${safeCode}
    WHERE id = ${runId}
  `);
}

/** Returns recent scan runs (most recent first), sanitized for API response. */
export async function getRecentRuns(limit = 10): Promise<ScanRunRecord[]> {
  try {
    const rows = await db.execute(sql`
      SELECT id, initiated_by, range_start, range_end, used_cursor,
             run_status, images_considered, images_scanned, images_skipped,
             images_with_signal, images_failed, detector_name, detector_version,
             started_at, finished_at, created_at, error_code
      FROM image_safeguard_scan_runs
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    return (rows as unknown as Array<Record<string, unknown>>).map(rowToScanRun);
  } catch {
    return [];
  }
}

/**
 * Normalises a MySQL DATETIME string ('YYYY-MM-DD HH:MM:SS') to an ISO-8601
 * string ('YYYY-MM-DDTHH:MM:SSZ') so that new Date(value) is valid in all
 * browsers. Safari and Firefox reject the space-separated MySQL format.
 * Returns the original string unchanged if it is already ISO or empty.
 */
function normaliseDatetime(raw: unknown): string {
  const s = String(raw ?? '');
  if (!s) return s;
  // MySQL DATETIME: "YYYY-MM-DD HH:MM:SS" — replace space with T and append Z
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    return s.replace(' ', 'T') + 'Z';
  }
  return s;
}

function rowToScanRun(row: Record<string, unknown>): ScanRunRecord {
  return {
    id:               String(row.id ?? ''),
    initiatedBy:      String(row.initiated_by ?? ''),
    rangeStart:       normaliseDatetime(row.range_start),
    rangeEnd:         normaliseDatetime(row.range_end),
    usedCursor:       Boolean(row.used_cursor),
    runStatus:        (row.run_status as RunStatus) ?? 'failed',
    imagesConsidered: Number(row.images_considered ?? 0),
    imagesScanned:    Number(row.images_scanned ?? 0),
    imagesSkipped:    Number(row.images_skipped ?? 0),
    imagesWithSignal: Number(row.images_with_signal ?? 0),
    imagesFailed:     Number(row.images_failed ?? 0),
    detectorName:     row.detector_name ? String(row.detector_name) : null,
    detectorVersion:  row.detector_version ? String(row.detector_version) : null,
    startedAt:        row.started_at  ? normaliseDatetime(row.started_at)  : null,
    finishedAt:       row.finished_at ? normaliseDatetime(row.finished_at) : null,
    createdAt:        normaliseDatetime(row.created_at),
    errorCode:        row.error_code ? String(row.error_code) : null,
  };
}

// ── Finding persistence ───────────────────────────────────────────────────────

/**
 * Persists individual scan results to image_safeguard_findings.
 *
 * RULES (enforced here):
 *  - Only privacy_signal and failed results are stored — clear and unavailable
 *    are counted in the run record only; no row is created.
 *  - r2Key is NEVER stored here — it goes to image_safeguard_finding_keys only.
 *  - id and scannedAt are generated server-side — never from the scan result.
 *  - Empty results array is a no-op (no INSERT, no error).
 *  - Rows are inserted in a single batch for efficiency.
 */
export async function persistFindings(
  runId: string,
  results: ImageScanResult[],
): Promise<void> {
  // Filter to only storable results — clear and unavailable are never stored as rows
  const storable = results.filter(
    r => r.result === 'privacy_signal' || r.result === 'failed',
  );
  if (storable.length === 0) return;

  const now = new Date();

  const rows = storable.map(r => ({
    id:              randomUUID(),
    scanRunId:       runId,
    assetId:         r.assetId,
    companyId:       r.companyId,
    userId:          r.userId ?? null,
    result:          r.result,
    faceCount:       r.faceCount,
    detectorName:    r.detectorName,
    detectorVersion: r.detectorVersion,
    failureCode:     r.failureCode ?? null,
    reviewed:        0 as const,
    // scannedAt generated server-side — never from scan result
    scannedAt:       now,
  }));

  await db.insert(imageSafeguardFindings).values(rows);
}
