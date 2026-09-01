/**
 * image-safeguard-scan-runs.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B2/CP12B3 — Idempotent migration for the image_safeguard_scan_runs table.
 *
 * TABLES CREATED / ALTERED:
 *   image_safeguard_scan_runs      — one row per scan run initiated by a platform owner
 *   image_safeguard_findings       — one row per privacy_signal/failed image in a scan run
 *   image_safeguard_scan_cursor    — singleton cursor for last successful scan
 *   image_safeguard_finding_keys   — server-side R2 key lookup (NEVER exposed via API)
 *
 * SAFETY RULES:
 *   - All DDL is idempotent (IF NOT EXISTS / column existence checks).
 *   - Never drops or truncates existing data.
 *   - Migration failure is logged but does not crash the server.
 *   - No credentials, signed URLs or image bytes are stored.
 *   - image_safeguard_finding_keys stores R2 keys server-side only —
 *     they are NEVER returned in any API response.
 */

import { db } from '../client.js';
import { sql } from 'drizzle-orm';

export async function runImageSafeguardScanRunsMigration(): Promise<void> {
  try {
    // ── 1. image_safeguard_scan_runs ──────────────────────────────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS image_safeguard_scan_runs (
        id              VARCHAR(36)   NOT NULL PRIMARY KEY,
        initiated_by    VARCHAR(36)   NOT NULL,
        -- Requested date range (ISO-8601 strings stored as VARCHAR for portability)
        range_start     VARCHAR(32)   NOT NULL,
        range_end       VARCHAR(32)   NOT NULL,
        -- Whether this run used the "since last scan" cursor
        used_cursor     TINYINT(1)    NOT NULL DEFAULT 0,
        -- Run lifecycle: pending | running | completed | failed | cancelled
        run_status      VARCHAR(16)   NOT NULL DEFAULT 'pending',
        -- Counts (updated atomically at completion)
        images_considered INT         NOT NULL DEFAULT 0,
        images_scanned    INT         NOT NULL DEFAULT 0,
        images_skipped    INT         NOT NULL DEFAULT 0,
        images_with_signal INT        NOT NULL DEFAULT 0,
        images_failed     INT         NOT NULL DEFAULT 0,
        -- Detector name and version used
        detector_name   VARCHAR(64)   NULL,
        detector_version VARCHAR(32)  NULL,
        -- Timestamps
        started_at      DATETIME(3)   NULL,
        finished_at     DATETIME(3)   NULL,
        created_at      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        -- Sanitized error code only — no stack traces, no internal paths
        error_code      VARCHAR(64)   NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 2. image_safeguard_findings ───────────────────────────────────────────
    // One row per image assessed in a scan run.
    // NEVER stores: R2 keys, signed URLs, image bytes, face crops, raw paths.
    // Internal asset ID only — review link uses authenticated image route.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS image_safeguard_findings (
        id              VARCHAR(36)   NOT NULL PRIMARY KEY,
        scan_run_id     VARCHAR(36)   NOT NULL,
        -- Internal asset reference — NOT an R2 key or signed URL
        asset_id        VARCHAR(36)   NOT NULL,
        company_id      INT           NOT NULL,
        user_id         VARCHAR(36)   NULL,
        -- Result: clear | privacy_signal | unavailable | failed
        result          VARCHAR(32)   NOT NULL DEFAULT 'unavailable',
        -- Approximate face count (integer, never a face crop or embedding)
        face_count      INT           NOT NULL DEFAULT 0,
        -- Detector used
        detector_name   VARCHAR(64)   NULL,
        detector_version VARCHAR(32)  NULL,
        -- Sanitized failure code only
        failure_code    VARCHAR(64)   NULL,
        -- Human review fields
        reviewed        TINYINT(1)    NOT NULL DEFAULT 0,
        reviewer_id     VARCHAR(36)   NULL,
        reviewed_at     DATETIME(3)   NULL,
        -- Short factual note — no conclusions about criminal conduct
        reviewer_note   VARCHAR(500)  NULL,
        scanned_at      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        CONSTRAINT fk_isf_run FOREIGN KEY (scan_run_id)
          REFERENCES image_safeguard_scan_runs(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 3. image_safeguard_scan_cursor ────────────────────────────────────────
    // Single-row table holding the last-successful-scan timestamp.
    // Only advanced when a run completes successfully.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS image_safeguard_scan_cursor (
        id              INT           NOT NULL PRIMARY KEY DEFAULT 1,
        last_successful_scan_at VARCHAR(32) NULL,
        last_successful_run_id  VARCHAR(36) NULL,
        updated_at      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
          ON UPDATE CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Ensure the singleton row exists (id=1).
    await db.execute(sql`
      INSERT IGNORE INTO image_safeguard_scan_cursor (id) VALUES (1)
    `);

    // ── 3b. Backfill error_code column if the table was created before CP12B4 ──
    // The CREATE TABLE above is a no-op when the table already exists.
    // If the table was created without error_code, add it now.
    try {
      await db.execute(sql`
        ALTER TABLE image_safeguard_scan_runs
          ADD COLUMN IF NOT EXISTS error_code VARCHAR(64) NULL
      `);
    } catch (alterErr) {
      // MySQL < 8.0 does not support IF NOT EXISTS on ALTER TABLE ADD COLUMN.
      // Fall back to a column-existence check + conditional ALTER.
      try {
        const [colRows] = await db.execute(sql`
          SELECT COUNT(*) AS cnt
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME   = 'image_safeguard_scan_runs'
            AND COLUMN_NAME  = 'error_code'
        `);
        const exists = Number((colRows as Array<{ cnt: number }>)[0]?.cnt ?? 0) > 0;
        if (!exists) {
          await db.execute(sql.raw(
            'ALTER TABLE `image_safeguard_scan_runs` ADD COLUMN `error_code` VARCHAR(64) NULL',
          ));
        }
      } catch (fallbackErr) {
        console.error(
          '[migration] image_safeguard_scan_runs.error_code alter failed:',
          fallbackErr instanceof Error ? fallbackErr.message : fallbackErr,
        );
      }
    }

    // ── 4. Indexes ────────────────────────────────────────────────────────────
    const addIndexIfNotExists = async (table: string, indexName: string, cols: string) => {
      const [rows] = await db.execute(sql`
        SELECT COUNT(*) AS cnt
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = ${table}
          AND INDEX_NAME   = ${indexName}
      `);
      const cnt = Number((rows as Array<{ cnt: number }>)[0]?.cnt ?? 0);
      if (cnt === 0) {
        await db.execute(
          sql.raw(`ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` (${cols})`),
        );
      }
    };

    await addIndexIfNotExists('image_safeguard_scan_runs', 'idx_issr_status',       'run_status');
    await addIndexIfNotExists('image_safeguard_scan_runs', 'idx_issr_initiated_by', 'initiated_by');
    await addIndexIfNotExists('image_safeguard_scan_runs', 'idx_issr_created_at',   'created_at');
    await addIndexIfNotExists('image_safeguard_findings',  'idx_isf_run',           'scan_run_id');
    await addIndexIfNotExists('image_safeguard_findings',  'idx_isf_company',       'company_id');
    await addIndexIfNotExists('image_safeguard_findings',  'idx_isf_asset',         'asset_id');
    await addIndexIfNotExists('image_safeguard_findings',  'idx_isf_result',        'result');

    // ── 5. image_safeguard_finding_keys (CP12B3) ──────────────────────────────
    // Server-side R2 key lookup table.
    // NEVER exposed via any API response — used only by the authenticated
    // preview endpoint to stream image bytes directly.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS image_safeguard_finding_keys (
        finding_id  VARCHAR(36)   NOT NULL PRIMARY KEY,
        -- R2 object key — NEVER returned in any API response
        r2_key      VARCHAR(1024) NOT NULL,
        created_at  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        CONSTRAINT fk_isfk_finding FOREIGN KEY (finding_id)
          REFERENCES image_safeguard_findings(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('[migration] image_safeguard_scan_runs: ready');

    // Verify error_code column exists — log so production startup confirms it
    try {
      const [verifyRows] = await db.execute(sql`
        SELECT COUNT(*) AS cnt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'image_safeguard_scan_runs'
          AND COLUMN_NAME  = 'error_code'
      `);
      const hasCol = Number((verifyRows as Array<{ cnt: number }>)[0]?.cnt ?? 0) > 0;
      console.log('[migration] image_safeguard_scan_runs.error_code column:', hasCol ? 'present' : 'MISSING — scan failures will not record error codes');
    } catch {
      // Non-fatal — verification failure does not block startup
    }
  } catch (err) {
    console.error(
      '[migration] image_safeguard_scan_runs failed:',
      err instanceof Error ? err.message : err,
    );
  }
}
