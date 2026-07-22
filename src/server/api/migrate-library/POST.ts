/**
 * POST /api/migrate-library
 * Platform owner only.
 *
 * Creates the developer-controlled content library tables:
 *   - library_items          : global source records (developer/admin managed)
 *   - company_library_items  : company-scoped installed copies (user-editable)
 *
 * Idempotent — safe to run multiple times.
 *
 * Access: requirePlatformOwner middleware in entry.ts
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];

  async function tryExec(label: string, query: string) {
    try {
      await db.execute(sql.raw(query));
      results.push(`✅ ${label}`);
    } catch (err) {
      const msg = String(err);
      if (msg.includes('Duplicate') || msg.includes('already exists') || msg.includes('Multiple primary key')) {
        results.push(`⚠️  ${label}: already exists`);
      } else {
        results.push(`❌ ${label}: ${msg.slice(0, 200)}`);
      }
    }
  }

  // ── 1. library_items — global source records ──────────────────────────────
  await tryExec('Create library_items', `
    CREATE TABLE IF NOT EXISTS library_items (
      id              INT PRIMARY KEY AUTO_INCREMENT,
      type            VARCHAR(50)  NOT NULL,
      category        VARCHAR(100) NULL,
      title           VARCHAR(255) NOT NULL,
      summary         TEXT         NULL,
      tags            TEXT         NULL,
      discipline      VARCHAR(100) NULL,
      version         VARCHAR(30)  NOT NULL DEFAULT '1.0',
      status          VARCHAR(30)  NOT NULL DEFAULT 'active',
      visibility      VARCHAR(30)  NOT NULL DEFAULT 'public',
      content         LONGTEXT     NULL,
      metadata_json   TEXT         NULL,
      source_links    TEXT         NULL,
      owner_user_id   VARCHAR(36)  NULL,
      install_count   INT          NOT NULL DEFAULT 0,
      download_count  INT          NOT NULL DEFAULT 0,
      rating_count    INT          NOT NULL DEFAULT 0,
      rating_sum      INT          NOT NULL DEFAULT 0,
      created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_lib_visibility  (visibility),
      INDEX idx_lib_type        (type),
      INDEX idx_lib_category    (category),
      INDEX idx_lib_updated_at  (updated_at),
      INDEX idx_lib_owner       (owner_user_id),
      INDEX idx_lib_install_cnt (install_count)
    )
  `);

  // ── 2. company_library_items — installed company copies ───────────────────
  await tryExec('Create company_library_items', `
    CREATE TABLE IF NOT EXISTS company_library_items (
      id                INT PRIMARY KEY AUTO_INCREMENT,
      company_id        INT          NOT NULL,
      source_item_id    INT          NOT NULL,
      source_version    VARCHAR(30)  NOT NULL DEFAULT '1.0',
      type              VARCHAR(50)  NOT NULL,
      category          VARCHAR(100) NULL,
      title             VARCHAR(255) NOT NULL,
      content           LONGTEXT     NULL,
      metadata_json     TEXT         NULL,
      installed_by      VARCHAR(36)  NULL,
      installed_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      updated_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      update_available  TINYINT(1)   NOT NULL DEFAULT 0,
      FOREIGN KEY (company_id)     REFERENCES companies(id)     ON DELETE CASCADE,
      FOREIGN KEY (source_item_id) REFERENCES library_items(id) ON DELETE RESTRICT,
      INDEX idx_cli_company    (company_id),
      INDEX idx_cli_source     (source_item_id),
      INDEX idx_cli_type       (type),
      INDEX idx_cli_updated_at (updated_at),
      UNIQUE KEY uq_cli_company_source (company_id, source_item_id)
    )
  `);

  // ── 3. library_feedback — optional rating + comment ───────────────────────
  await tryExec('Create library_feedback', `
    CREATE TABLE IF NOT EXISTS library_feedback (
      id             INT PRIMARY KEY AUTO_INCREMENT,
      item_id        INT          NOT NULL,
      company_id     INT          NOT NULL,
      user_id        VARCHAR(36)  NULL,
      rating         TINYINT      NOT NULL DEFAULT 0,
      comment        TEXT         NULL,
      created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id)    REFERENCES library_items(id) ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id)     ON DELETE CASCADE,
      UNIQUE KEY uq_feedback_company_item (company_id, item_id)
    )
  `);

  // ── 4. Full-text index on library_items for search ────────────────────────
  await tryExec('Add FULLTEXT index on library_items (title, summary, tags)', `
    ALTER TABLE library_items
      ADD FULLTEXT INDEX ft_lib_search (title, summary, tags)
  `);

  // ── 5. builder_json column (stores DocumentBlock[] JSON) ─────────────────
  await tryExec('Add builder_json to library_items', `
    ALTER TABLE library_items ADD COLUMN builder_json LONGTEXT NULL
  `);

  // ── 6. file_path / file_mime / source_file_name for downloads ────────────
  await tryExec('Add file_path to library_items', `
    ALTER TABLE library_items ADD COLUMN file_path VARCHAR(500) NULL
  `);
  await tryExec('Add file_mime to library_items', `
    ALTER TABLE library_items ADD COLUMN file_mime VARCHAR(100) NULL
  `);
  await tryExec('Add source_file_name to library_items', `
    ALTER TABLE library_items ADD COLUMN source_file_name VARCHAR(255) NULL
  `);

  // ── 7. Submission tracking columns ───────────────────────────────────────
  await tryExec('Add submitted_by_company_id to library_items', `
    ALTER TABLE library_items ADD COLUMN submitted_by_company_id INT NULL
  `);
  await tryExec('Add submitted_by_user_id to library_items', `
    ALTER TABLE library_items ADD COLUMN submitted_by_user_id VARCHAR(36) NULL
  `);
  await tryExec('Add reviewer_notes to library_items', `
    ALTER TABLE library_items ADD COLUMN reviewer_notes TEXT NULL
  `);
  await tryExec('Add reviewed_at to library_items', `
    ALTER TABLE library_items ADD COLUMN reviewed_at TIMESTAMP NULL
  `);
  await tryExec('Add reviewed_by to library_items', `
    ALTER TABLE library_items ADD COLUMN reviewed_by VARCHAR(36) NULL
  `);
  await tryExec('Add index on visibility+status', `
    ALTER TABLE library_items ADD INDEX idx_lib_vis_status (visibility, status)
  `);

  const ok = results.every((r) => !r.startsWith('❌'));
  res.json({ ok, results });
}
