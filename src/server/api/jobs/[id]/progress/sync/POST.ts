import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobProgressLines, jobs, estimates, estimateLines, profiles } from '../../../../../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';

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

    // Find the approved estimate for this job
    const approvedEstimate = await db.query.estimates.findFirst({
      where: and(
        eq(estimates.jobId, jobId),
        eq(estimates.companyId, profile.companyId),
        eq(estimates.status, 'Approved'),
      ),
    });

    if (!approvedEstimate) {
      return res.status(400).json({ error: 'No approved estimate found for this job' });
    }

    // Get estimate lines
    const srcLines = await db
      .select()
      .from(estimateLines)
      .where(eq(estimateLines.estimateId, approvedEstimate.id))
      .orderBy(asc(estimateLines.lineOrder), asc(estimateLines.id));

    if (srcLines.length === 0) {
      return res.status(400).json({ error: 'Approved estimate has no lines' });
    }

    // Delete existing progress lines and replace with estimate lines
    await db.delete(jobProgressLines).where(and(
      eq(jobProgressLines.jobId, jobId),
      eq(jobProgressLines.companyId, profile.companyId),
    ));

    if (srcLines.length > 0) {
      for (const l of srcLines) {
        await db.insert(jobProgressLines).values({
          jobId,
          companyId: profile.companyId,
          estimateLineId: l.id,
          description: l.description,
          quantity: l.quantity,
          unit: l.unit ?? null,
          rate: l.rate,
          percentComplete: 0,
          progressNote: null,
        });
      }
    }

    const lines = await db
      .select()
      .from(jobProgressLines)
      .where(and(eq(jobProgressLines.jobId, jobId), eq(jobProgressLines.companyId, profile.companyId)))
      .orderBy(asc(jobProgressLines.id));

    res.json({ ok: true, lines, estimateTitle: approvedEstimate.title });
  } catch (err) {
    console.error('POST /api/jobs/:id/progress/sync error:', err);
    res.status(500).json({ error: 'Failed to sync progress' });
  }
}
