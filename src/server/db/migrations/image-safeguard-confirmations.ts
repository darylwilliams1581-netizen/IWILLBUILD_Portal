/**
 * image-safeguard-confirmations.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A7 — Migration for the image_safeguard_confirmations table.
 *
 * This table stores server-issued, single-use, bound confirmation tokens.
 * Each token is cryptographically bound to:
 *   - authenticated company_id + user_id
 *   - sharing action (share_link | form_email)
 *   - sorted digest of the exact image storage refs
 *   - sorted digest of recipients (form_email only)
 *   - expiry (5 minutes from issuance)
 *   - unique nonce (prevents replay even within the TTL window)
 *
 * The consuming endpoint (photos/share or job-forms/send-email) must:
 *   1. Present the token
 *   2. Verify company_id + user_id match the authenticated session
 *   3. Verify the token is not expired
 *   4. Verify the token has not been consumed (used_at IS NULL)
 *   5. Verify the image_refs_digest matches the refs it is about to share
 *   6. Verify the recipients_digest matches the recipients (form_email only)
 *   7. Verify the worst_status is not blocked or elevated
 *   8. Mark the token consumed (used_at = NOW()) atomically
 *
 * SCHEMA NOTE:
 * The `id` column stores the SHA-256 hex digest of the raw token (64 chars).
 * The raw token (48 random bytes, base64url encoded) is returned to the client
 * but NEVER stored. On consumption the endpoint hashes the presented token and
 * looks up by hash. This means a DB breach does not expose usable tokens.
 *
 * IDEMPOTENCY:
 *   - CREATE TABLE IF NOT EXISTS — safe to run on every startup
 *   - ADD INDEX uses information_schema existence check (no ER_DUP_KEYNAME)
 *
 * CLEANUP:
 *   - Expired tokens are left in place for audit; a future cron can purge
 *     rows older than 30 days.
 */

import { db } from '../client.js';
import { sql } from 'drizzle-orm';

export async function runImageSafeguardConfirmationsMigration(): Promise<void> {
  try {
    // ── 1. Create table ───────────────────────────────────────────────────────
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS image_safeguard_confirmations (
        id              VARCHAR(64)  NOT NULL PRIMARY KEY COMMENT 'SHA-256 hex of raw token — raw token never stored',
        company_id      INT          NOT NULL,
        user_id         VARCHAR(36)  NOT NULL,
        action          VARCHAR(50)  NOT NULL COMMENT 'share_link | form_email',
        image_refs_digest VARCHAR(64) NOT NULL COMMENT 'SHA-256 hex of sorted storage refs',
        recipients_digest VARCHAR(64) COMMENT 'SHA-256 hex of sorted recipients (form_email only)',
        worst_status    VARCHAR(30)  NOT NULL,
        nonce           VARCHAR(36)  NOT NULL UNIQUE,
        expires_at      DATETIME(3)  NOT NULL,
        used_at         DATETIME(3)  NULL COMMENT 'NULL = not yet consumed; set atomically on use',
        created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `));

    // ── 2. Add indexes (idempotent via information_schema check) ──────────────
    await addIndexIfNotExists(
      'idx_isc_company_user',
      'company_id, user_id',
    );
    await addIndexIfNotExists(
      'idx_isc_expires',
      'expires_at',
    );
    await addIndexIfNotExists(
      'idx_isc_nonce',
      'nonce',
    );

    console.log('[imageSafeguardConfirmations] migration ready');
  } catch (err) {
    // Migration failure must not crash the server — log and continue.
    console.error(
      '[imageSafeguardConfirmations] migration failed (non-fatal):',
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Add an index to image_safeguard_confirmations only if it does not already
 * exist. Uses information_schema.STATISTICS to check — never raises
 * ER_DUP_KEYNAME (errno 1061).
 */
async function addIndexIfNotExists(
  indexName: string,
  columnList: string,
): Promise<void> {
  const rows = await db.execute(sql.raw(`
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'image_safeguard_confirmations'
      AND INDEX_NAME   = '${indexName}'
    LIMIT 1
  `));
  const exists = Array.isArray(rows) && rows.length > 0;
  if (exists) return;
  await db.execute(sql.raw(
    `ALTER TABLE image_safeguard_confirmations ADD INDEX ${indexName} (${columnList})`,
  ));
}
