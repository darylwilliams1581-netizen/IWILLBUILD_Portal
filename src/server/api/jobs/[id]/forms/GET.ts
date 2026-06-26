import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { formTemplates, jobFormSubmissions, jobs, profiles } from '../../../../db/schema.js';
import { eq, and, asc, desc } from 'drizzle-orm';
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

    // Verify job belongs to company
    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Get active Job-type templates for this company
    const templates = await db.query.formTemplates.findMany({
      where: and(
        eq(formTemplates.companyId, profile.companyId),
        eq(formTemplates.formType, 'Job'),
        eq(formTemplates.isActive, true),
      ),
      orderBy: [asc(formTemplates.name)],
    });

    // Get all submissions for this job
    const submissions = await db.query.jobFormSubmissions.findMany({
      where: and(
        eq(jobFormSubmissions.jobId, jobId),
        eq(jobFormSubmissions.companyId, profile.companyId),
      ),
      orderBy: [desc(jobFormSubmissions.createdAt)],
    });

    res.json({ templates, submissions });
  } catch (error) {
    console.error('GET /api/jobs/:id/forms error:', error);
    res.status(500).json({ error: 'Failed to load job forms' });
  }
}
