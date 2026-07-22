/**
 * POST /api/migrate-plan-manager
 * Idempotent migration — creates all Plan Manager / Drawings tables if they don't exist.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];

  async function run(name: string, ddl: string) {
    try {
      await db.execute(sql.raw(ddl));
      results.push(`✓ ${name}`);
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      if (
        msg.includes('already exists') ||
        msg.includes('Duplicate column name') ||
        msg.includes('ER_TABLE_EXISTS') ||
        msg.includes('ER_DUP_FIELDNAME')
      ) {
        results.push(`~ ${name} (already exists)`);
      } else {
        results.push(`✗ ${name}: ${msg}`);
        console.warn(`[migrate-plan-manager] ${name} failed:`, msg);
      }
    }
  }

  // ── project_drawings ───────────────────────────────────────────────────────
  await run('project_drawings', `
    CREATE TABLE IF NOT EXISTS project_drawings (
      id                   INT AUTO_INCREMENT PRIMARY KEY,
      company_id           INT          NOT NULL,
      name                 VARCHAR(255) NOT NULL,
      drawing_number       VARCHAR(100) NULL,
      discipline           VARCHAR(100) NULL,
      description          TEXT         NULL,
      status               VARCHAR(50)  NOT NULL DEFAULT 'active',
      current_revision_id  INT          NULL,
      created_by           VARCHAR(36)  NULL,
      created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_company (company_id),
      INDEX idx_status  (status)
    )
  `);

  // ── drawing_revisions ──────────────────────────────────────────────────────
  await run('drawing_revisions', `
    CREATE TABLE IF NOT EXISTS drawing_revisions (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      drawing_id   INT          NOT NULL,
      company_id   INT          NOT NULL,
      revision_no  VARCHAR(20)  NOT NULL DEFAULT '0',
      name         VARCHAR(255) NULL,
      source_type  VARCHAR(50)  NOT NULL DEFAULT 'upload',
      file_path    VARCHAR(500) NULL,
      file_name    VARCHAR(255) NULL,
      mime_type    VARCHAR(100) NULL,
      locked       TINYINT(1)   NOT NULL DEFAULT 0,
      uploaded_by  VARCHAR(36)  NULL,
      created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_drawing  (drawing_id),
      INDEX idx_company  (company_id)
    )
  `);

  // ── drawing_annotations ────────────────────────────────────────────────────
  await run('drawing_annotations', `
    CREATE TABLE IF NOT EXISTS drawing_annotations (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      drawing_id   INT          NOT NULL,
      revision_id  INT          NULL,
      company_id   INT          NOT NULL,
      type         VARCHAR(50)  NOT NULL DEFAULT 'comment',
      data_json    LONGTEXT     NULL,
      created_by   VARCHAR(36)  NULL,
      created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_drawing (drawing_id),
      INDEX idx_company (company_id)
    )
  `);

  // ── drawing_share_tokens ───────────────────────────────────────────────────
  await run('drawing_share_tokens', `
    CREATE TABLE IF NOT EXISTS drawing_share_tokens (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      drawing_id   INT          NOT NULL,
      company_id   INT          NOT NULL,
      token_hash   VARCHAR(255) NOT NULL UNIQUE,
      scope        VARCHAR(100) NOT NULL DEFAULT 'view',
      expires_at   DATETIME     NULL,
      revoked      TINYINT(1)   NOT NULL DEFAULT 0,
      created_by   VARCHAR(36)  NULL,
      created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_drawing (drawing_id),
      INDEX idx_token   (token_hash)
    )
  `);

  // ── drawing_audit_log ──────────────────────────────────────────────────────
  await run('drawing_audit_log', `
    CREATE TABLE IF NOT EXISTS drawing_audit_log (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      drawing_id   INT          NOT NULL,
      company_id   INT          NOT NULL,
      action       VARCHAR(100) NOT NULL,
      actor_id     VARCHAR(36)  NULL,
      details_json TEXT         NULL,
      created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_drawing (drawing_id),
      INDEX idx_company (company_id)
    )
  `);

  // ── job_drawing_links ──────────────────────────────────────────────────────
  await run('job_drawing_links', `
    CREATE TABLE IF NOT EXISTS job_drawing_links (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      job_id      INT      NOT NULL,
      drawing_id  INT      NOT NULL,
      company_id  INT      NOT NULL,
      linked_by   VARCHAR(36) NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_job_drawing (job_id, drawing_id),
      INDEX idx_job     (job_id),
      INDEX idx_drawing (drawing_id)
    )
  `);

  const failed = results.filter(r => r.startsWith('✗'));
  return res.status(failed.length ? 500 : 200).json({ results, ok: failed.length === 0 });
}
