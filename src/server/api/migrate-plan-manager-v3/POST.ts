/**
 * POST /api/migrate-plan-manager-v3
 * Idempotent — fixes all column mismatches between the original migration
 * and the actual API handlers. Safe to run multiple times.
 *
 * Fixes:
 *   project_drawings   — add title (alias for name), source_file_path,
 *                        source_file_name, page_count, drawing_number,
 *                        discipline, description, project_id
 *   drawing_revisions  — add locked_at, is_current, file_path, file_name,
 *                        mime_type, uploaded_by
 *   drawing_audit_log  — add revision_id column
 *   drawing_annotations — rebuild to match handler expectations
 *                         (geometry_json, style_json, label, author_id,
 *                          page_no, is_locked, type)
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
        msg.includes('ER_DUP_FIELDNAME') ||
        msg.includes('ER_TABLE_EXISTS')
      ) {
        results.push(`~ ${name} (already exists)`);
      } else {
        results.push(`✗ ${name}: ${msg}`);
        console.warn(`[migrate-plan-manager-v3] ${name} failed:`, msg);
      }
    }
  }

  // ── project_drawings: add missing columns ─────────────────────────────────
  await run('project_drawings.title', `
    ALTER TABLE project_drawings ADD COLUMN title VARCHAR(255) NULL
  `);
  await run('project_drawings.source_file_path', `
    ALTER TABLE project_drawings ADD COLUMN source_file_path VARCHAR(500) NULL
  `);
  await run('project_drawings.source_file_name', `
    ALTER TABLE project_drawings ADD COLUMN source_file_name VARCHAR(255) NULL
  `);
  await run('project_drawings.page_count', `
    ALTER TABLE project_drawings ADD COLUMN page_count INT NOT NULL DEFAULT 1
  `);
  await run('project_drawings.drawing_number', `
    ALTER TABLE project_drawings ADD COLUMN drawing_number VARCHAR(100) NULL
  `);
  await run('project_drawings.discipline', `
    ALTER TABLE project_drawings ADD COLUMN discipline VARCHAR(100) NULL
  `);
  await run('project_drawings.description', `
    ALTER TABLE project_drawings ADD COLUMN description TEXT NULL
  `);
  await run('project_drawings.project_id', `
    ALTER TABLE project_drawings ADD COLUMN project_id INT NULL
  `);

  // Backfill title from name for any existing rows
  await run('project_drawings.backfill title from name', `
    UPDATE project_drawings SET title = name WHERE title IS NULL AND name IS NOT NULL AND name != ''
  `);

  // ── drawing_revisions: add missing columns ────────────────────────────────
  await run('drawing_revisions.locked_at', `
    ALTER TABLE drawing_revisions ADD COLUMN locked_at DATETIME NULL
  `);
  await run('drawing_revisions.is_current', `
    ALTER TABLE drawing_revisions ADD COLUMN is_current TINYINT(1) NOT NULL DEFAULT 0
  `);
  await run('drawing_revisions.file_path', `
    ALTER TABLE drawing_revisions ADD COLUMN file_path VARCHAR(500) NULL
  `);
  await run('drawing_revisions.file_name', `
    ALTER TABLE drawing_revisions ADD COLUMN file_name VARCHAR(255) NULL
  `);
  await run('drawing_revisions.mime_type', `
    ALTER TABLE drawing_revisions ADD COLUMN mime_type VARCHAR(100) NULL
  `);
  await run('drawing_revisions.uploaded_by', `
    ALTER TABLE drawing_revisions ADD COLUMN uploaded_by VARCHAR(36) NULL
  `);

  // ── drawing_audit_log: add revision_id ────────────────────────────────────
  await run('drawing_audit_log.revision_id', `
    ALTER TABLE drawing_audit_log ADD COLUMN revision_id INT NULL
  `);

  // ── drawing_annotations: add all columns used by handlers ─────────────────
  // The original migration created drawing_annotations with only
  // (id, drawing_id, revision_id, company_id, type, data_json, created_by, created_at, updated_at).
  // The annotation handlers expect: geometry_json, style_json, label, author_id, page_no, is_locked.
  await run('drawing_annotations.geometry_json', `
    ALTER TABLE drawing_annotations ADD COLUMN geometry_json LONGTEXT NULL
  `);
  await run('drawing_annotations.style_json', `
    ALTER TABLE drawing_annotations ADD COLUMN style_json LONGTEXT NULL
  `);
  await run('drawing_annotations.label', `
    ALTER TABLE drawing_annotations ADD COLUMN label VARCHAR(500) NULL
  `);
  await run('drawing_annotations.author_id', `
    ALTER TABLE drawing_annotations ADD COLUMN author_id VARCHAR(36) NULL
  `);
  await run('drawing_annotations.page_no', `
    ALTER TABLE drawing_annotations ADD COLUMN page_no INT NOT NULL DEFAULT 1
  `);
  await run('drawing_annotations.is_locked', `
    ALTER TABLE drawing_annotations ADD COLUMN is_locked TINYINT(1) NOT NULL DEFAULT 0
  `);

  // ── job_drawing_links: add context_note if missing ────────────────────────
  await run('job_drawing_links.context_note', `
    ALTER TABLE job_drawing_links ADD COLUMN context_note TEXT NULL
  `);

  const failed = results.filter(r => r.startsWith('✗'));
  return res.status(failed.length ? 500 : 200).json({ results, ok: failed.length === 0 });
}
