/**
 * GET /api/jobs/:id/documents
 * List document templates linked to a job.
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
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const jobId = Number(req.params.id);
    if (!jobId) return res.status(400).json({ error: 'Invalid job ID' });

    const [rows] = await db.execute(sql.raw(
      `SELECT dt.id, dt.name, dt.template_type, dt.doc_kind, dt.updated_at,
              jdl.linked_at, jdl.id AS link_id
       FROM job_document_links jdl
       JOIN document_templates dt ON dt.id = jdl.document_template_id
       WHERE jdl.job_id = ${jobId} AND jdl.company_id = ${profile.companyId}
       ORDER BY jdl.linked_at DESC`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({ documents: rows ?? [] });
  } catch (err) {
    console.error('GET /api/jobs/:id/documents error:', err);
    return res.status(500).json({ error: 'Failed to fetch job documents' });
  }
}
