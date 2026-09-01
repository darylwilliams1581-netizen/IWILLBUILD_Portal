/**
 * image-safeguard.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A — Idempotent migration for the image_safeguard_records table.
 *
 * Called once at server startup from entry.ts.
 *
 * WHAT IS STORED (see schema.ts for full documentation):
 *   - Opaque record ID, company/user IDs, opaque storage_ref
 *   - Surface, job/submission context, protocol status
 *   - Safe scan result JSON (no image bytes, no signed URLs, no R2 keys)
 *   - Policy version, review status, timestamps
 *
 * WHAT IS NEVER STORED:
 *   - Raw image bytes, face crops, signed URLs, R2 credentials
 *   - Sensitive image descriptions
 *   - R2 object keys (storage_ref is an opaque internal reference)
 *
 * IDEMPOTENCY STRATEGY:
 *   - Table:   CREATE TABLE IF NOT EXISTS — safe on every run
 *   - Columns: ADD COLUMN IF NOT EXISTS   — MySQL 8.0+ native; safe on every run
 *   - Indexes: information_schema existence check before ALTER TABLE ADD INDEX
 *              This avoids broadly swallowing ER_DUP_KEYNAME (errno 1061).
 *              A duplicate-index error is a real schema inconsistency and must
 *              not be silently ignored — we skip the ADD only when we can
 *              confirm the index already exists.
 */

import { db } from '../client.js';
import { sql } from 'drizzle-orm';

const TABLE_NAME = 'image_safeguard_records';

/**
 * Add a column only when it does not already exist.
 * Uses ADD COLUMN IF NOT EXISTS (MySQL 8.0+).
 * Any error other than "column already exists" is re-thrown.
 */
async function addColumnIfNotExists(columnDef: string): Promise<void> {
  try {
    await db.execute(sql.raw(
      `ALTER TABLE ${TABLE_NAME} ADD COLUMN IF NOT EXISTS ${columnDef}`,
    ));
  } catch (err) {
    // ER_DUP_FIELDNAME (1060) — column already exists on older MySQL that
    // does not support IF NOT EXISTS. Safe to ignore.
    const code = (err as { code?: string; errno?: number }).code ?? '';
    const errno = (err as { code?: string; errno?: number }).errno ?? 0;
    if (code === 'ER_DUP_FIELDNAME' || errno === 1060) return;
    throw err;
  }
}

/**
 * Add an index only when it does not already exist.
 *
 * Uses information_schema.STATISTICS to check for the index before issuing
 * ALTER TABLE ADD INDEX. This is explicit and does not swallow errors:
 *   - If the check query fails, the error propagates.
 *   - If the index already exists, we skip the ADD (not an error).
 *   - If the ADD itself fails for any reason, the error propagates.
 */
async function addIndexIfNotExists(
  indexName: string,
  columnList: string,
): Promise<void> {
  // Query information_schema to determine whether the index already exists.
  // We use the db variable name from the connection string; fall back to
  // DATABASE() which resolves at query time.
  const rows = await db.execute(sql.raw(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = '${TABLE_NAME}'
       AND INDEX_NAME   = '${indexName}'
     LIMIT 1`,
  )) as unknown as Array<unknown>;

  // information_schema returns an array of rows; if any row exists the index
  // is already present.
  const exists = Array.isArray(rows) && rows.length > 0;
  if (exists) return;

  await db.execute(sql.raw(
    `ALTER TABLE ${TABLE_NAME} ADD INDEX ${indexName} (${columnList})`,
  ));
}

export async function runImageSafeguardMigration(): Promise<void> {
  try {
    // ── 1. Create table ───────────────────────────────────────────────────────
    // Indexes are declared inside CREATE TABLE so they are created atomically
    // on first run. The addIndexIfNotExists calls in step 3 handle the case
    // where the table already existed without those indexes.
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id               VARCHAR(36)   NOT NULL PRIMARY KEY,
        company_id       INT           NOT NULL,
        user_id          VARCHAR(36)   NOT NULL,
        storage_ref      VARCHAR(255)  NOT NULL,
        surface          VARCHAR(64)   NOT NULL,
        job_id           INT           NULL,
        submission_id    INT           NULL,
        status           VARCHAR(32)   NOT NULL DEFAULT 'pending',
        scan_result_json TEXT          NULL,
        policy_version   VARCHAR(16)   NOT NULL DEFAULT '1.0',
        review_status    VARCHAR(32)   NOT NULL DEFAULT 'none',
        created_at       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_isr_company_status (company_id, status),
        INDEX idx_isr_user           (user_id),
        INDEX idx_isr_job            (job_id),
        INDEX idx_isr_storage_ref    (storage_ref)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `));

    // ── 2. ADD COLUMN IF NOT EXISTS guards (idempotent) ───────────────────────
    // These handle the case where the table was created in an earlier partial
    // run and is missing columns added in subsequent schema revisions.
    await addColumnIfNotExists(`job_id INT NULL`);
    await addColumnIfNotExists(`submission_id INT NULL`);
    await addColumnIfNotExists(`scan_result_json TEXT NULL`);
    await addColumnIfNotExists(`policy_version VARCHAR(16) NOT NULL DEFAULT '1.0'`);
    await addColumnIfNotExists(`review_status VARCHAR(32) NOT NULL DEFAULT 'none'`);

    // ── 3. ADD INDEX guards (information_schema existence check) ──────────────
    // Each call checks information_schema.STATISTICS before issuing ALTER TABLE.
    // A duplicate-index error (ER_DUP_KEYNAME / errno 1061) is never silently
    // swallowed — the check prevents it from occurring in the first place.
    await addIndexIfNotExists('idx_isr_company_status', 'company_id, status');
    await addIndexIfNotExists('idx_isr_user',           'user_id');
    await addIndexIfNotExists('idx_isr_job',            'job_id');
    await addIndexIfNotExists('idx_isr_storage_ref',    'storage_ref');

    console.log('[migration] image_safeguard_records: ready');
  } catch (err) {
    // Migration failure must not crash the server — log and continue.
    // The table will be created on the next startup attempt.
    console.error('[migration] image_safeguard_records failed:', err instanceof Error ? err.message : err);
  }
}
