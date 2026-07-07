/**
 * DELETE /api/plan-manager/drawings/:id/job-links/:jobId
 * Remove a drawing from a job (unlink, does not delete the drawing).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
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

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const drawingId = parseInt(req.params.id, 10);
    const jobId = parseInt(req.params.jobId, 10);

    await db.execute(sql.raw(`
      DELETE FROM job_drawing_links
      WHERE drawing_id = ${drawingId} AND job_id = ${jobId} AND company_id = ${profile.companyId}
    `));

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/plan-manager/drawings/:id/job-links/:jobId error:', err);
    res.status(500).json({ error: 'Failed to unlink' });
  }
}
