/**
 * POST /api/migrate-studio-phase2
 * ─────────────────────────────────────────────────────────────────────────────
 * Idempotent migration for Studio Phase 2.
 *
 * ARCHITECTURE DECISION:
 *   Studio-generated SWMS documents attach to jobs via the EXISTING job_swms
 *   table — no parallel table, no synthetic swms_templates rows.
 *
 *   job_swms gains four nullable columns:
 *     studio_document_id      — document_templates.id (null for legacy SWMS)
 *     studio_source_revision  — revision string captured at attachment time
 *     content_snapshot_json   — immutable builder_json snapshot at attachment time
 *     studio_attached_at      — timestamp of attachment
 *
 *   Constraint: exactly one of (swms_template_id, studio_document_id) must be
 *   non-null per row. Enforced at the application layer.
 *
 *   swms_signoffs continues referencing job_swms.id — no changes needed there.
 *
 *   document_templates gains applied_widgets_json for queryable widget metadata
 *   (mirrors builder_json.appliedWidgets without JSON parsing).
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

    // ── 1. job_swms: studio_document_id ──────────────────────────────────────
    // References document_templates.id. NULL for legacy SWMS rows.
    await run('job_swms.studio_document_id', `
      ALTER TABLE job_swms
      ADD COLUMN studio_document_id INT NULL
        COMMENT 'document_templates.id — set for Studio-generated SWMS; null for legacy template SWMS'
    `);

    // ── 2. job_swms: studio_source_revision ──────────────────────────────────
    await run('job_swms.studio_source_revision', `
      ALTER TABLE job_swms
      ADD COLUMN studio_source_revision VARCHAR(20) NULL
        COMMENT 'Revision string captured at attachment time (e.g. "1", "2", "A")'
    `);

    // ── 3. job_swms: content_snapshot_json ───────────────────────────────────
    // Immutable snapshot of builder_json at the moment of job attachment.
    // Later edits to the master document_templates row do NOT affect this.
    await run('job_swms.content_snapshot_json', `
      ALTER TABLE job_swms
      ADD COLUMN content_snapshot_json LONGTEXT NULL
        COMMENT 'Immutable builder_json snapshot captured at job-attachment time'
    `);

    // ── 4. job_swms: studio_attached_at ──────────────────────────────────────
    await run('job_swms.studio_attached_at', `
      ALTER TABLE job_swms
      ADD COLUMN studio_attached_at DATETIME NULL
        COMMENT 'Timestamp when the Studio document was attached to this job'
    `);

    // ── 5. document_templates: applied_widgets_json ──────────────────────────
    // Mirrors builder_json.appliedWidgets for queryability without JSON parsing.
    // The canonical source of truth is builder_json; this column is a cache.
    await run('document_templates.applied_widgets_json', `
      ALTER TABLE document_templates
      ADD COLUMN applied_widgets_json MEDIUMTEXT NULL
        COMMENT 'JSON array of AppliedWidgetMeta — mirrors builder_json.appliedWidgets'
    `);

    return res.json({
      ok: true,
      results,
      summary: [
        'No new tables created.',
        'job_swms extended with 4 nullable Studio columns.',
        'swms_template_id remains nullable — set for legacy rows, null for Studio rows.',
        'swms_signoffs unchanged — still references job_swms.id.',
        'No synthetic swms_templates rows are created.',
      ],
    });
  } catch (err) {
    console.error('POST /api/migrate-studio-phase2 error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
