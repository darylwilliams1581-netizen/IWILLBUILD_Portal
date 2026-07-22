/**
 * POST /api/jobs/:id/documents
 * Attach an existing document_template to a job via job_document_links.
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

    const { documentTemplateId } = req.body as { documentTemplateId?: number };
    if (!documentTemplateId) return res.status(400).json({ error: 'documentTemplateId is required' });

    // Verify job belongs to company
    const [jobRows] = await db.execute(sql.raw(
      `SELECT id FROM jobs WHERE id = ${jobId} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number }>, unknown];
    if (!jobRows?.[0]) return res.status(404).json({ error: 'Job not found' });

    // Verify template belongs to company
    const [tplRows] = await db.execute(sql.raw(
      `SELECT id, name FROM document_templates WHERE id = ${documentTemplateId} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number; name: string }>, unknown];
    if (!tplRows?.[0]) return res.status(404).json({ error: 'Document template not found' });

    // Upsert link (ignore duplicate)
    await db.execute(sql.raw(
      `INSERT IGNORE INTO job_document_links (company_id, job_id, document_template_id, linked_by_user_id)
       VALUES (${profile.companyId}, ${jobId}, ${documentTemplateId}, ${JSON.stringify(session.user.id)})`
    ));

    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/jobs/:id/documents error:', err);
    return res.status(500).json({ error: 'Failed to attach document to job' });
  }
}
