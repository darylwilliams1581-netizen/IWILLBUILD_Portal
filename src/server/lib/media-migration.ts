/**
 * media-migration.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Additive startup migration for the canonical media_assets and
 * media_asset_links tables.
 *
 * Rules:
 *  - CREATE TABLE IF NOT EXISTS — safe to run repeatedly
 *  - INFORMATION_SCHEMA checks before ALTER TABLE — idempotent column adds
 *  - Uses migrationErrMsg / isDupColumnError pattern from entry.ts
 *  - Never deletes existing rows or storage files
 *  - Skips silently on duplicate-table / duplicate-column errors
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';

// ── Error helpers (mirrors entry.ts) ─────────────────────────────────────────

export function mediaMigrationErrMsg(e: unknown): string {
  let current: unknown = e;
  let depth = 0;
  let best = '';
  while (current != null && depth < 10) {
    depth++;
    const node = current as {
      message?: string;
      sqlMessage?: string;
      code?: string;
      errno?: number;
      cause?: unknown;
    };
    const sqlMsg = String(node.sqlMessage ?? '');
    const msg    = String(node.message ?? '');
    const code   = String(node.code ?? '');
    if (sqlMsg && sqlMsg !== 'undefined') best = sqlMsg;
    else if (msg && msg !== 'undefined' && !msg.startsWith('Failed query:')) best = msg;
    if (code && code !== 'undefined' && !best.includes(code)) best = `${best} [${code}]`.trim();
    const next = node.cause;
    if (next === current || next == null) break;
    current = next;
  }
  if (!best) best = String((e as Error)?.message ?? e);
  return best;
}

export function mediaMigrationIsDupColumn(e: unknown): boolean {
  let current: unknown = e;
  let depth = 0;
  while (current != null && depth < 10) {
    depth++;
    const node = current as {
      message?: string;
      sqlMessage?: string;
      code?: string;
      errno?: number;
      cause?: unknown;
    };
    const msg    = String(node.message ?? '');
    const sqlMsg = String(node.sqlMessage ?? '');
    const code   = String(node.code ?? '');
    const errno  = Number(node.errno ?? 0);
    if (
      errno === 1060 ||
      code === 'ER_DUP_FIELDNAME' ||
      msg.includes('ER_DUP_FIELDNAME') ||
      msg.includes('Duplicate column') ||
      sqlMsg.includes('Duplicate column')
    ) return true;
    const next = node.cause;
    if (next === current || next == null) break;
    current = next;
  }
  return false;
}

function isTableExistsError(e: unknown): boolean {
  const msg = mediaMigrationErrMsg(e);
  return msg.includes('already exists') || msg.includes('ER_TABLE_EXISTS');
}

// ── Column existence check ────────────────────────────────────────────────────

async function columnExists(table: string, column: string): Promise<boolean> {
  try {
    const result = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME   = ${table}
            AND COLUMN_NAME  = ${column}`
    ) as unknown as [Array<{ cnt: number }>, unknown];
    return Number(result[0]?.[0]?.cnt ?? 0) > 0;
  } catch {
    return false;
  }
}

async function indexExists(table: string, indexName: string): Promise<boolean> {
  try {
    const result = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME   = ${table}
            AND INDEX_NAME   = ${indexName}`
    ) as unknown as [Array<{ cnt: number }>, unknown];
    return Number(result[0]?.[0]?.cnt ?? 0) > 0;
  } catch {
    return false;
  }
}

// ── Main migration ────────────────────────────────────────────────────────────

export async function runMediaAssetsMigration(): Promise<void> {
  // ── 1. media_assets ──────────────────────────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS media_assets (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        company_id          INT NOT NULL,
        storage_key         VARCHAR(1000) NOT NULL,
        storage_provider    VARCHAR(50)  NOT NULL DEFAULT 'r2',
        original_name       VARCHAR(500) NOT NULL,
        mime_type           VARCHAR(100) NOT NULL,
        file_type           VARCHAR(50)  NOT NULL,
        size_bytes          INT          NOT NULL DEFAULT 0,
        checksum            VARCHAR(128) NULL,
        label               VARCHAR(500) NULL,
        caption             TEXT         NULL,
        captured_at         DATETIME     NULL,
        uploaded_by_user_id VARCHAR(36)  NULL,
        status              VARCHAR(30)  NOT NULL DEFAULT 'active',
        created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ma_company    (company_id),
        INDEX idx_ma_storage    (storage_key(255)),
        INDEX idx_ma_checksum   (checksum),
        INDEX idx_ma_uploader   (uploaded_by_user_id),
        INDEX idx_ma_created    (created_at)
      )
    `);
    console.log('[media-migration] media_assets table ready');
  } catch (e: unknown) {
    if (!isTableExistsError(e)) {
      console.warn('[media-migration] media_assets CREATE failed:', mediaMigrationErrMsg(e));
    }
  }

  // ── 2. media_asset_links ─────────────────────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS media_asset_links (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        media_asset_id   INT          NOT NULL,
        company_id       INT          NOT NULL,
        destination_type VARCHAR(50)  NOT NULL,
        destination_id   INT          NULL,
        field_key        VARCHAR(255) NULL,
        sort_order       INT          NOT NULL DEFAULT 0,
        created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_mal_asset       (media_asset_id),
        INDEX idx_mal_company     (company_id),
        INDEX idx_mal_dest        (destination_type, destination_id),
        INDEX idx_mal_dest_field  (destination_type, field_key(191))
      )
    `);
    console.log('[media-migration] media_asset_links table ready');
  } catch (e: unknown) {
    if (!isTableExistsError(e)) {
      console.warn('[media-migration] media_asset_links CREATE failed:', mediaMigrationErrMsg(e));
    }
  }

  // ── 3. Idempotency table for X-Client-Id deduplication ───────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS media_upload_idempotency (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        client_id   VARCHAR(255) NOT NULL,
        company_id  INT          NOT NULL,
        response    MEDIUMTEXT   NOT NULL,
        expires_at  DATETIME     NOT NULL,
        created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE INDEX idx_muid_client (client_id, company_id),
        INDEX idx_muid_expires (expires_at)
      )
    `);
    console.log('[media-migration] media_upload_idempotency table ready');
  } catch (e: unknown) {
    if (!isTableExistsError(e)) {
      console.warn('[media-migration] media_upload_idempotency CREATE failed:', mediaMigrationErrMsg(e));
    }
  }

  // ── 4. Add client_id column to media_assets (idempotent) ─────────────────────
  if (!(await columnExists('media_assets', 'client_id'))) {
    try {
      await db.execute(sql.raw(`ALTER TABLE \`media_assets\` ADD COLUMN \`client_id\` VARCHAR(255) NULL`));
      console.log('[media-migration] media_assets.client_id added');
    } catch (e: unknown) {
      if (!mediaMigrationIsDupColumn(e)) {
        console.warn('[media-migration] media_assets.client_id alter failed:', mediaMigrationErrMsg(e));
      }
    }
  }

  // ── 5. Add client_id index to media_assets (idempotent) ──────────────────────
  if (!(await indexExists('media_assets', 'idx_ma_client_id'))) {
    try {
      await db.execute(sql.raw(`ALTER TABLE \`media_assets\` ADD INDEX \`idx_ma_client_id\` (\`client_id\`)`));
      console.log('[media-migration] media_assets idx_ma_client_id added');
    } catch (e: unknown) {
      const msg = mediaMigrationErrMsg(e);
      if (!msg.includes('Duplicate key name') && !msg.includes('ER_DUP_KEYNAME')) {
        console.warn('[media-migration] media_assets idx_ma_client_id failed:', msg);
      }
    }
  }

  // ── 6. Add locked_at to media_assets (canonical lock timestamp) ───────────────
  if (!(await columnExists('media_assets', 'locked_at'))) {
    try {
      await db.execute(sql.raw(`ALTER TABLE \`media_assets\` ADD COLUMN \`locked_at\` DATETIME NULL`));
      console.log('[media-migration] media_assets.locked_at added');
    } catch (e: unknown) {
      if (!mediaMigrationIsDupColumn(e)) {
        console.warn('[media-migration] media_assets.locked_at alter failed:', mediaMigrationErrMsg(e));
      }
    }
  }

  // ── 7. Add locked_by_user_id to media_assets ──────────────────────────────────
  if (!(await columnExists('media_assets', 'locked_by_user_id'))) {
    try {
      await db.execute(sql.raw(`ALTER TABLE \`media_assets\` ADD COLUMN \`locked_by_user_id\` VARCHAR(36) NULL`));
      console.log('[media-migration] media_assets.locked_by_user_id added');
    } catch (e: unknown) {
      if (!mediaMigrationIsDupColumn(e)) {
        console.warn('[media-migration] media_assets.locked_by_user_id alter failed:', mediaMigrationErrMsg(e));
      }
    }
  }

  // ── 8. Add locked_at to job_photos ────────────────────────────────────────────
  if (!(await columnExists('job_photos', 'locked_at'))) {
    try {
      await db.execute(sql.raw(`ALTER TABLE \`job_photos\` ADD COLUMN \`locked_at\` DATETIME NULL`));
      console.log('[media-migration] job_photos.locked_at added');
    } catch (e: unknown) {
      if (!mediaMigrationIsDupColumn(e)) {
        console.warn('[media-migration] job_photos.locked_at alter failed:', mediaMigrationErrMsg(e));
      }
    }
  }

  // ── 9. Add locked_by_user_id to job_photos ────────────────────────────────────
  if (!(await columnExists('job_photos', 'locked_by_user_id'))) {
    try {
      await db.execute(sql.raw(`ALTER TABLE \`job_photos\` ADD COLUMN \`locked_by_user_id\` VARCHAR(36) NULL`));
      console.log('[media-migration] job_photos.locked_by_user_id added');
    } catch (e: unknown) {
      if (!mediaMigrationIsDupColumn(e)) {
        console.warn('[media-migration] job_photos.locked_by_user_id alter failed:', mediaMigrationErrMsg(e));
      }
    }
  }

  // ── 10. Add locked_by_name to job_photos ──────────────────────────────────────
  if (!(await columnExists('job_photos', 'locked_by_name'))) {
    try {
      await db.execute(sql.raw(`ALTER TABLE \`job_photos\` ADD COLUMN \`locked_by_name\` VARCHAR(255) NULL`));
      console.log('[media-migration] job_photos.locked_by_name added');
    } catch (e: unknown) {
      if (!mediaMigrationIsDupColumn(e)) {
        console.warn('[media-migration] job_photos.locked_by_name alter failed:', mediaMigrationErrMsg(e));
      }
    }
  }

  // ── 11. Add status to job_photos ('draft' | 'locked') ─────────────────────────
  if (!(await columnExists('job_photos', 'status'))) {
    try {
      await db.execute(sql.raw(`ALTER TABLE \`job_photos\` ADD COLUMN \`status\` VARCHAR(20) NOT NULL DEFAULT 'draft'`));
      console.log('[media-migration] job_photos.status added');
    } catch (e: unknown) {
      if (!mediaMigrationIsDupColumn(e)) {
        console.warn('[media-migration] job_photos.status alter failed:', mediaMigrationErrMsg(e));
      }
    }
  }

  // ── 12. Add media_asset_id FK to job_photos ───────────────────────────────────
  if (!(await columnExists('job_photos', 'media_asset_id'))) {
    try {
      await db.execute(sql.raw(`ALTER TABLE \`job_photos\` ADD COLUMN \`media_asset_id\` INT NULL`));
      console.log('[media-migration] job_photos.media_asset_id added');
    } catch (e: unknown) {
      if (!mediaMigrationIsDupColumn(e)) {
        console.warn('[media-migration] job_photos.media_asset_id alter failed:', mediaMigrationErrMsg(e));
      }
    }
  }

  // ── 13. Index on job_photos.status for fast locked-photo queries ──────────────
  if (!(await indexExists('job_photos', 'idx_jp_status'))) {
    try {
      await db.execute(sql.raw(`ALTER TABLE \`job_photos\` ADD INDEX \`idx_jp_status\` (\`status\`)`));
      console.log('[media-migration] job_photos idx_jp_status added');
    } catch (e: unknown) {
      const msg = mediaMigrationErrMsg(e);
      if (!msg.includes('Duplicate key name') && !msg.includes('ER_DUP_KEYNAME')) {
        console.warn('[media-migration] job_photos idx_jp_status failed:', msg);
      }
    }
  }

  console.log('[media-migration] all media asset migrations complete');
}
