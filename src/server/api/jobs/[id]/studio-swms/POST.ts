/**
 * POST /api/jobs/:id/studio-swms
 * ─────────────────────────────────────────────────────────────────────────────
 * Attaches a Studio document (document_templates) to a job by inserting a
 * row into the EXISTING job_swms table.
 *
 * ARCHITECTURE:
 *   - No parallel table. No synthetic swms_templates rows.
 *   - Studio attachments live in job_swms alongside legacy SWMS attachments.
 *   - swms_template_id is NULL for Studio rows; studio_document_id is set.
 *   - content_snapshot_json captures builder_json at attachment time —
 *     later edits to the master do NOT affect this job's version.
 *   - swms_signoffs continues referencing job_swms.id unchanged.
 *
 * Body:
 *   studioDocId  number   — document_templates.id
 *   revision     string?  — revision label (default '1')
 *
 * Returns the new job_swms row.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { ResultSetHeader } from 'mysql2';

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

    const jobId = parseInt(req.params.id, 10);
    if (!jobId) return res.status(400).json({ error: 'Invalid job ID' });

    const { studioDocId, revision } = req.body as {
      studioDocId: number;
      revision?: string;
    };
    if (!studioDocId) return res.status(400).json({ error: 'studioDocId required' });

    const companyId = profile.companyId;

    // ── 1. Load master document ───────────────────────────────────────────────
    const [docRows] = await db.execute(sql.raw(
      `SELECT id, name, template_type, builder_json
       FROM document_templates
       WHERE id = ${studioDocId} AND company_id = ${companyId}
       LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    const doc = Array.isArray(docRows) ? docRows[0] : null;
    if (!doc) return res.status(404).json({ error: 'Studio document not found' });

    // ── 2. Verify job belongs to company ─────────────────────────────────────
    const [jobRows] = await db.execute(sql.raw(
      `SELECT id, name, job_number FROM jobs
       WHERE id = ${jobId} AND company_id = ${companyId}
       LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!Array.isArray(jobRows) || !jobRows[0]) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const job = jobRows[0];

    // ── 3. Capture immutable snapshot ─────────────────────────────────────────
    // builder_json is already a JSON string in the DB; store it as-is.
    const snapshotJson = typeof doc.builder_json === 'string'
      ? doc.builder_json
      : JSON.stringify(doc.builder_json ?? {});

    const revisionLabel = (revision ?? '1').trim() || '1';
    const docTitle = String(doc.name ?? 'Studio Document');
    const attachedAt = new Date().toISOString().slice(0, 19).replace('T', ' '); // DATETIME

    // ── 4. Insert into job_swms ───────────────────────────────────────────────
    // swms_template_id is NULL — this is a Studio-sourced row.
    // The Studio columns may not exist yet if migration hasn't run.
    let insertId: number;
    try {
      const [result] = await db.execute(sql.raw(
        `INSERT INTO job_swms
           (company_id, job_id, title, status, assigned_by_user_id,
            studio_document_id, studio_source_revision,
            content_snapshot_json, studio_attached_at)
         VALUES
           (${companyId}, ${jobId},
            ${JSON.stringify(docTitle)}, 'active',
            ${JSON.stringify(session.user.id)},
            ${studioDocId},
            ${JSON.stringify(revisionLabel)},
            ${JSON.stringify(snapshotJson)},
            ${JSON.stringify(attachedAt)})`
      )) as unknown as [ResultSetHeader, unknown];
      insertId = result.insertId;
    } catch (insertErr: unknown) {
      const msg = String((insertErr as { message?: string }).message ?? insertErr);
      if (msg.includes("Unknown column") && msg.includes('studio_')) {
        return res.status(503).json({
          error: 'Migration required. Run POST /api/migrate-studio-phase2 as platform owner first.',
          migrationRequired: true,
        });
      }
      throw insertErr;
    }

    // ── 5. Fetch the created row ──────────────────────────────────────────────
    const [newRows] = await db.execute(sql.raw(
      `SELECT js.*,
              j.name AS job_name, j.job_number AS job_number_display
       FROM job_swms js
       LEFT JOIN jobs j ON j.id = js.job_id
       WHERE js.id = ${insertId}
       LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    const newRow = Array.isArray(newRows) ? newRows[0] : null;

    return res.status(201).json({
      ok: true,
      jobSwmsId: insertId,
      jobSwms: newRow,
      jobId,
      studioDocId,
      docTitle,
      revision: revisionLabel,
      // No synthetic records created — sign-ons use job_swms.id directly
      syntheticRecordsCreated: false,
    });
  } catch (err) {
    console.error('POST /api/jobs/:id/studio-swms error:', err);
    return res.status(500).json({ error: 'Failed to attach Studio document to job' });
  }
}
