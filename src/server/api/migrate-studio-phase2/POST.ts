/**
 * POST /api/migrate-studio-phase2
 * ─────────────────────────────────────────────────────────────────────────────
 * Idempotent migration for Studio Phase 2:
 *
 *   1. Creates job_studio_documents table — links a Studio document_templates
 *      record to a job with an immutable content snapshot.
 *
 *   2. Adds applied_widgets_json column to document_templates — stores
 *      AppliedWidgetMeta[] so duplicate detection survives a page reload.
 *      (The column is also written into builder_json but a dedicated column
 *      makes it queryable without JSON parsing.)
 *
 *   3. Adds studio_doc_id column to job_swms — bridges the sign-on workflow
 *      to Studio-generated documents.
 *
 * Platform-owner only. Safe to run multiple times.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getSecret } from '#airo/secrets';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, session.user.id)).limit(1);
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const ownerEmail = getSecret('PLATFORM_OWNER_EMAIL');
    if (session.user.email !== ownerEmail) return res.status(403).json({ error: 'Platform owner only' });

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
          console.warn(`[migrate-studio-phase2] ${name} failed:`, msg);
        }
      }
    }

    // ── 1. job_studio_documents ───────────────────────────────────────────────
    await run('job_studio_documents table', `
      CREATE TABLE IF NOT EXISTS job_studio_documents (
        id                      INT AUTO_INCREMENT PRIMARY KEY,
        company_id              INT NOT NULL,
        job_id                  INT NOT NULL,
        studio_doc_id           INT NOT NULL COMMENT 'document_templates.id of the master',
        -- Immutable snapshot of the master at attachment time.
        -- Later edits to the master do NOT affect this record.
        content_snapshot_json   LONGTEXT NOT NULL,
        -- Denormalised job fields captured at attachment time for PDF merge.
        job_title               VARCHAR(255) NULL,
        job_number              VARCHAR(100) NULL,
        site_address            TEXT NULL,
        client_name             VARCHAR(255) NULL,
        supervisor_name         VARCHAR(255) NULL,
        -- Document identity at attachment time
        doc_title               VARCHAR(255) NOT NULL,
        doc_number              VARCHAR(100) NULL,
        revision                VARCHAR(20) NOT NULL DEFAULT '1',
        date_attached           DATE NOT NULL,
        -- Bridge to existing sign-on workflow:
        -- When a Studio SWMS is attached to a job a synthetic swms_templates row
        -- is created and its ID is stored here so swms_signoffs can reference it.
        bridge_swms_template_id INT NULL COMMENT 'swms_templates.id of the synthetic bridge row',
        -- Lifecycle
        attached_by_user_id     VARCHAR(36) NOT NULL,
        created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_company_job (company_id, job_id),
        INDEX idx_studio_doc (studio_doc_id)
      )
    `);

    // ── 2. applied_widgets_json column on document_templates ─────────────────
    await run('document_templates.applied_widgets_json', `
      ALTER TABLE document_templates
      ADD COLUMN applied_widgets_json MEDIUMTEXT NULL
        COMMENT 'JSON array of AppliedWidgetMeta — mirrors builder_json.appliedWidgets for queryability'
    `);

    // ── 3. studio_doc_id column on job_swms ──────────────────────────────────
    await run('job_swms.studio_doc_id', `
      ALTER TABLE job_swms
      ADD COLUMN studio_doc_id INT NULL
        COMMENT 'job_studio_documents.id — set when this row was created as a sign-on bridge for a Studio doc'
    `);

    return res.json({ ok: true, results });
  } catch (err) {
    console.error('POST /api/migrate-studio-phase2 error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
