import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { jobProgressLines, jobs, profiles } from '../../../../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

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

    const jobId = parseInt(String(req.params.id), 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const job = await db.query.jobs.findFirst({ where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)) });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Bulk update: array of { id, percentComplete, progressNote }
    const { updates } = req.body as {
      updates: Array<{ id: number; percentComplete?: number; progressNote?: string }>;
    };

    if (!Array.isArray(updates)) return res.status(400).json({ error: 'updates array required' });

    for (const u of updates) {
      const lineId = parseInt(String(u.id), 10);
      if (isNaN(lineId)) continue;
      const upd: Record<string, unknown> = {};
      if (u.percentComplete !== undefined) upd.percentComplete = Math.max(0, Math.min(100, u.percentComplete));
      if (u.progressNote !== undefined) upd.progressNote = u.progressNote?.trim() || null;
      if (Object.keys(upd).length > 0) {
        await db.update(jobProgressLines)
          .set(upd)
          .where(and(eq(jobProgressLines.id, lineId), eq(jobProgressLines.companyId, profile.companyId)));
      }
    }

    const lines = await db
      .select()
      .from(jobProgressLines)
      .where(and(eq(jobProgressLines.jobId, jobId), eq(jobProgressLines.companyId, profile.companyId)))
      .orderBy(asc(jobProgressLines.id));

    res.json({ lines });
  } catch (err) {
    console.error('PUT /api/jobs/:id/progress error:', err);
    res.status(500).json({ error: 'Failed to update progress' });
  }
}
