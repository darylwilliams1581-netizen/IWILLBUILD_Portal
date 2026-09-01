/**
 * GET /api/owner-console/image-safeguard/debug-runs
 * ─────────────────────────────────────────────────────────────────────────────
 * TEMPORARY DIAGNOSTIC ENDPOINT — platform-owner only.
 *
 * Returns the raw MySQL rows from image_safeguard_scan_runs so we can see
 * exactly what the DB contains, bypassing rowToScanRun mapping.
 *
 * Also returns the raw column names from the result set so we can confirm
 * the SELECT is returning the expected columns.
 *
 * REMOVE THIS ENDPOINT once the scan run issue is diagnosed and fixed.
 */

import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  // requirePlatformOwner middleware applied in entry.ts
  try {
    // ── 1. Raw row dump ──────────────────────────────────────────────────────
    let rawRows: unknown = null;
    let rawError: string | null = null;
    try {
      rawRows = await db.execute(sql`
        SELECT id, initiated_by, range_start, range_end, used_cursor,
               run_status, images_considered, images_scanned,
               images_with_signal, images_failed, detector_name,
               started_at, finished_at, created_at, error_code
        FROM image_safeguard_scan_runs
        ORDER BY created_at DESC
        LIMIT 10
      `);
    } catch (e) {
      rawError = e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
    }

    // ── 2. Table existence check ─────────────────────────────────────────────
    let tableExists: boolean | null = null;
    let tableError: string | null = null;
    try {
      const rows = await db.execute(sql`
        SELECT COUNT(*) AS cnt
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = 'image_safeguard_scan_runs'
      `);
      const cnt = Number((rows as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0);
      tableExists = cnt > 0;
    } catch (e) {
      tableError = e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200);
    }

    // ── 3. Row count ─────────────────────────────────────────────────────────
    let rowCount: number | null = null;
    let countError: string | null = null;
    try {
      const rows = await db.execute(sql`
        SELECT COUNT(*) AS cnt FROM image_safeguard_scan_runs
      `);
      rowCount = Number((rows as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0);
    } catch (e) {
      countError = e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200);
    }

    // ── 4. Column list ───────────────────────────────────────────────────────
    let columns: unknown = null;
    let columnsError: string | null = null;
    try {
      columns = await db.execute(sql`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'image_safeguard_scan_runs'
        ORDER BY ORDINAL_POSITION
      `);
    } catch (e) {
      columnsError = e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200);
    }

    return res.json({
      tableExists,
      tableError,
      rowCount,
      countError,
      rawRows,
      rawError,
      columns,
      columnsError,
      note: 'TEMPORARY DIAGNOSTIC — remove after issue resolved',
    });
  } catch (err) {
    return res.status(500).json({
      error: 'diagnostic_failed',
      message: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
    });
  }
}
