/**
 * recovery-email.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Idempotent CREATE TABLE IF NOT EXISTS for the three recovery-email tables.
 * Called once at server startup from entry.ts.
 */
import { db } from '../client.js';
import { sql } from 'drizzle-orm';

export async function runRecoveryEmailMigration(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS recovery_email_state (
        id                       VARCHAR(36)  NOT NULL PRIMARY KEY,
        user_id                  VARCHAR(36)  NOT NULL UNIQUE,
        active_email             VARCHAR(255),
        active_verified_at       DATETIME(3),
        proposed_email           VARCHAR(255),
        proposed_at              DATETIME(3),
        verify_token_hash        VARCHAR(64),
        verify_token_expires_at  DATETIME(3),
        proposed_verified_at     DATETIME(3),
        hold_expires_at          DATETIME(3),
        cancel_token_hash        VARCHAR(64),
        cancel_token_expires_at  DATETIME(3),
        cancel_token_used_at     DATETIME(3),
        freeze_token_hash        VARCHAR(64),
        freeze_token_expires_at  DATETIME(3),
        freeze_token_used_at     DATETIME(3),
        frozen_at                DATETIME(3),
        frozen_reason            VARCHAR(255),
        created_at               DATETIME(3)  NOT NULL DEFAULT NOW(3),
        updated_at               DATETIME(3)  NOT NULL DEFAULT NOW(3) ON UPDATE NOW(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS recovery_email_audit (
        id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id      VARCHAR(36)  NOT NULL,
        event        VARCHAR(50)  NOT NULL,
        masked_email VARCHAR(255),
        performed_by VARCHAR(36),
        ip_address   VARCHAR(45),
        user_agent   VARCHAR(500),
        metadata     TEXT,
        created_at   DATETIME(3)  NOT NULL DEFAULT NOW(3),
        INDEX idx_rea_user_id (user_id),
        INDEX idx_rea_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS recovery_change_blocks (
        id            VARCHAR(36)  NOT NULL PRIMARY KEY,
        user_id       VARCHAR(36)  NOT NULL,
        reason        VARCHAR(50)  NOT NULL,
        blocked_until DATETIME(3)  NOT NULL,
        created_at    DATETIME(3)  NOT NULL DEFAULT NOW(3),
        INDEX idx_rcb_user_id (user_id),
        INDEX idx_rcb_blocked_until (blocked_until)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('[recovery-email] migration OK');
  } catch (err) {
    console.error('[recovery-email] migration error:', err instanceof Error ? err.message : String(err));
    // Non-fatal at startup — tables may already exist
  }
}
