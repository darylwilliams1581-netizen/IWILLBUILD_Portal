/**
 * GET /api/jobs/:id/studio-swms
 * ─────────────────────────────────────────────────────────────────────────────
 * Lists all Studio document attachments for a job.
 *
 * Studio attachments are job_swms rows where studio_document_id IS NOT NULL.
 * Includes sign-off counts from swms_signoffs (unchanged — still references
 * job_swms.id directly).
 *
 * Falls back gracefully if the Studio columns don't exist yet (pre-migration).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';

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
    if (!profile?.companyId) return res.json({ studioAttachments: [] });

    const jobId = parseInt(req.params.id, 10);
    if (!jobId) return res.status(400).json({ error: 'Invalid job ID' });

    const companyId = profile.companyId;

    let rows: Array<Record<string, unknown>> = [];
    try {
      const [result] = await db.execute(sql.raw(
        `SELECT
           js.id,
           js.job_id,
           js.title,
           js.status,
           js.studio_document_id,
           js.studio_source_revision,
           js.studio_attached_at,
           js.assigned_by_user_id,
           js.created_at,
           dt.name        AS master_doc_name,
           dt.template_type AS master_template_type,
           (SELECT COUNT(*) FROM swms_signoffs ss WHERE ss.job_swms_id = js.id) AS signoff_count
         FROM job_swms js
         LEFT JOIN document_templates dt ON dt.id = js.studio_document_id
         WHERE js.job_id = ${jobId}
           AND js.company_id = ${companyId}
           AND js.studio_document_id IS NOT NULL
         ORDER BY js.created_at DESC`
      )) as unknown as [Array<Record<string, unknown>>, unknown];
      rows = Array.isArray(result) ? result : [];
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      if (msg.includes("Unknown column") && msg.includes('studio_')) {
        // Migration not yet run — return empty list gracefully
        return res.json({ studioAttachments: [], migrationRequired: true });
      }
      throw e;
    }

    return res.json({ studioAttachments: rows });
  } catch (err) {
    console.error('GET /api/jobs/:id/studio-swms error:', err);
    return res.status(500).json({ error: 'Failed to fetch Studio attachments' });
  }
}
