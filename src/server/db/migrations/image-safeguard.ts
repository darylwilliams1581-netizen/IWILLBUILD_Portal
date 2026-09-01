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
 */

import { db } from '../client.js';
import { sql } from 'drizzle-orm';

async function tryExec(statement: string): Promise<void> {
  try {
    await db.execute(sql.raw(statement));
  } catch {
    // Ignore — column already exists or table not yet created
  }
}

export async function runImageSafeguardMigration(): Promise<void> {
  try {
    // ── 1. Create table ───────────────────────────────────────────────────────
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS image_safeguard_records (
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

    await tryExec(`ALTER TABLE image_safeguard_records ADD COLUMN IF NOT EXISTS job_id INT NULL`);
    await tryExec(`ALTER TABLE image_safeguard_records ADD COLUMN IF NOT EXISTS submission_id INT NULL`);
    await tryExec(`ALTER TABLE image_safeguard_records ADD COLUMN IF NOT EXISTS scan_result_json TEXT NULL`);
    await tryExec(`ALTER TABLE image_safeguard_records ADD COLUMN IF NOT EXISTS policy_version VARCHAR(16) NOT NULL DEFAULT '1.0'`);
    await tryExec(`ALTER TABLE image_safeguard_records ADD COLUMN IF NOT EXISTS review_status VARCHAR(32) NOT NULL DEFAULT 'none'`);

    // ── 3. ADD INDEX IF NOT EXISTS guards ─────────────────────────────────────
    await tryExec(`ALTER TABLE image_safeguard_records ADD INDEX idx_isr_company_status (company_id, status)`);
    await tryExec(`ALTER TABLE image_safeguard_records ADD INDEX idx_isr_user (user_id)`);
    await tryExec(`ALTER TABLE image_safeguard_records ADD INDEX idx_isr_job (job_id)`);
    await tryExec(`ALTER TABLE image_safeguard_records ADD INDEX idx_isr_storage_ref (storage_ref)`);

    console.log('[migration] image_safeguard_records: ready');
  } catch (err) {
    // Migration failure must not crash the server — log and continue.
    // The table will be created on the next startup attempt.
    console.error('[migration] image_safeguard_records failed:', err instanceof Error ? err.message : err);
  }
}
