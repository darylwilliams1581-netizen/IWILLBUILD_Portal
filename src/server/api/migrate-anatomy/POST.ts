/**
 * POST /api/migrate-anatomy
 * ─────────────────────────────────────────────────────────────────────────────
 * Idempotent migration for Dazza Anatomy Index tables.
 * Platform-owner only (enforced in entry.ts via requirePlatformOwner).
 */

import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

async function run(label: string, fn: () => Promise<void>, results: string[]) {
  try {
    await fn();
    results.push(`✓ ${label}`);
  } catch (e) {
    results.push(`✗ ${label}: ${String(e).slice(0, 200)}`);
  }
}

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];

  // ── anatomy_snapshots ─────────────────────────────────────────────────────
  await run('anatomy_snapshots table', async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS anatomy_snapshots (
        id              VARCHAR(36)  PRIMARY KEY,
        source_type     ENUM('github','zip') NOT NULL,
        repo_owner      VARCHAR(200) NULL,
        repo_name       VARCHAR(200) NULL,
        branch          VARCHAR(200) NULL,
        commit_sha      VARCHAR(40)  NULL,
        commit_date     DATETIME     NULL,
        package_sha256  VARCHAR(64)  NULL,
        snapshot_name   VARCHAR(200) NULL,
        source_desc     VARCHAR(500) NULL,
        app_version     VARCHAR(100) NULL,
        build_number    VARCHAR(100) NULL,
        git_ref         VARCHAR(200) NULL,
        status          ENUM('pending','indexing','ready','failed','deleted') NOT NULL DEFAULT 'pending',
        is_active       TINYINT(1)   NOT NULL DEFAULT 0,
        total_files     INT          NOT NULL DEFAULT 0,
        indexed_files   INT          NOT NULL DEFAULT 0,
        excluded_files  INT          NOT NULL DEFAULT 0,
        quarantine_count INT         NOT NULL DEFAULT 0,
        error_message   TEXT         NULL,
        uploader_user_id VARCHAR(36) NULL,
        created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_anatomy_snapshots_status (status),
        INDEX idx_anatomy_snapshots_active (is_active),
        INDEX idx_anatomy_snapshots_sha (commit_sha)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }, results);

  // ── anatomy_files ─────────────────────────────────────────────────────────
  await run('anatomy_files table', async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS anatomy_files (
        id              BIGINT       PRIMARY KEY AUTO_INCREMENT,
        snapshot_id     VARCHAR(36)  NOT NULL,
        rel_path        VARCHAR(1000) NOT NULL,
        file_sha256     VARCHAR(64)  NULL,
        language        VARCHAR(50)  NULL,
        file_type       VARCHAR(50)  NULL,
        line_count      INT          NOT NULL DEFAULT 0,
        byte_size       INT          NOT NULL DEFAULT 0,
        is_excluded     TINYINT(1)   NOT NULL DEFAULT 0,
        is_quarantined  TINYINT(1)   NOT NULL DEFAULT 0,
        quarantine_reason VARCHAR(500) NULL,
        created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_anatomy_files_snapshot (snapshot_id),
        INDEX idx_anatomy_files_path (snapshot_id, rel_path(255)),
        INDEX idx_anatomy_files_lang (snapshot_id, language)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }, results);

  // ── anatomy_chunks ────────────────────────────────────────────────────────
  await run('anatomy_chunks table', async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS anatomy_chunks (
        id              BIGINT       PRIMARY KEY AUTO_INCREMENT,
        snapshot_id     VARCHAR(36)  NOT NULL,
        file_id         BIGINT       NOT NULL,
        rel_path        VARCHAR(1000) NOT NULL,
        start_line      INT          NOT NULL,
        end_line        INT          NOT NULL,
        content         MEDIUMTEXT   NOT NULL,
        chunk_type      VARCHAR(50)  NULL,
        symbol_name     VARCHAR(500) NULL,
        created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FULLTEXT INDEX ft_anatomy_chunks_content (content),
        INDEX idx_anatomy_chunks_snapshot (snapshot_id),
        INDEX idx_anatomy_chunks_file (file_id),
        INDEX idx_anatomy_chunks_path (snapshot_id, rel_path(255))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }, results);

  // ── anatomy_quarantine ────────────────────────────────────────────────────
  await run('anatomy_quarantine table', async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS anatomy_quarantine (
        id              BIGINT       PRIMARY KEY AUTO_INCREMENT,
        snapshot_id     VARCHAR(36)  NOT NULL,
        rel_path        VARCHAR(1000) NOT NULL,
        reason          VARCHAR(500) NOT NULL,
        pattern_matched VARCHAR(200) NULL,
        created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_anatomy_quarantine_snapshot (snapshot_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }, results);

  // ── dazza_review_comments: add anatomy columns ────────────────────────────
  await run('dazza_review_comments.anatomy_snapshot_id column', async () => {
    const [rows] = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'dazza_review_comments'
        AND COLUMN_NAME = 'anatomy_snapshot_id'
    `) as unknown as [Array<{ cnt: number }>, unknown];
    if (!rows[0]?.cnt) {
      await db.execute(sql.raw(
        "ALTER TABLE `dazza_review_comments` ADD COLUMN `anatomy_snapshot_id` VARCHAR(36) NULL"
      ));
    }
  }, results);

  await run('dazza_review_comments.anatomy_commit_sha column', async () => {
    const [rows] = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'dazza_review_comments'
        AND COLUMN_NAME = 'anatomy_commit_sha'
    `) as unknown as [Array<{ cnt: number }>, unknown];
    if (!rows[0]?.cnt) {
      await db.execute(sql.raw(
        "ALTER TABLE `dazza_review_comments` ADD COLUMN `anatomy_commit_sha` VARCHAR(40) NULL"
      ));
    }
  }, results);

  await run('dazza_review_comments.anatomy_source_type column', async () => {
    const [rows] = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'dazza_review_comments'
        AND COLUMN_NAME = 'anatomy_source_type'
    `) as unknown as [Array<{ cnt: number }>, unknown];
    if (!rows[0]?.cnt) {
      await db.execute(sql.raw(
        "ALTER TABLE `dazza_review_comments` ADD COLUMN `anatomy_source_type` VARCHAR(20) NULL"
      ));
    }
  }, results);

  res.json({ ok: true, results });
}
