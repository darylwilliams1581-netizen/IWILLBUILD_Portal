/**
 * GET /api/jobs/:id/studio-swms
 * ─────────────────────────────────────────────────────────────────────────────
 * Lists all Studio document attachments for a job, including sign-on counts
 * from the existing swms_signoffs table via the bridge row.
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
           jsd.*,
           dt.name AS master_doc_name,
           dt.template_type AS master_template_type,
           dt.doc_status AS master_doc_status,
           -- Sign-on count via bridge
           (SELECT COUNT(*) FROM swms_signoffs ss
            JOIN job_swms js ON js.id = ss.job_swms_id
            WHERE js.studio_doc_id = jsd.id) AS signoff_count
         FROM job_studio_documents jsd
         LEFT JOIN document_templates dt ON dt.id = jsd.studio_doc_id
         WHERE jsd.job_id = ${jobId} AND jsd.company_id = ${companyId}
         ORDER BY jsd.created_at DESC`
      )) as unknown as [Array<Record<string, unknown>>, unknown];
      rows = result ?? [];
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e);
      if (msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE')) {
        // Table not yet created — return empty list gracefully
        return res.json({ studioAttachments: [] });
      }
      throw e;
    }

    return res.json({ studioAttachments: rows });
  } catch (err) {
    console.error('GET /api/jobs/:id/studio-swms error:', err);
    return res.status(500).json({ error: 'Failed to fetch Studio attachments' });
  }
}
