import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { formTemplates, jobFormSubmissions, jobs, profiles } from '../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
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

    const { templateId } = req.body as { templateId?: number };
    if (!templateId) return res.status(400).json({ error: 'templateId required' });

    // Verify template belongs to company and is a Job type
    const template = await db.query.formTemplates.findFirst({
      where: and(
        eq(formTemplates.id, templateId),
        eq(formTemplates.companyId, profile.companyId),
        eq(formTemplates.formType, 'Job'),
        eq(formTemplates.isActive, true),
      ),
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const [result] = await db.insert(jobFormSubmissions).values({
      jobId,
      companyId: profile.companyId,
      templateId,
      completedByUserId: session.user.id,
      completedByName: session.user.name ?? 'Unknown',
      status: 'in_progress',
      answersJson: null,
    });

    const submission = await db.query.jobFormSubmissions.findFirst({
      where: eq(jobFormSubmissions.id, result.insertId),
    });

    res.status(201).json({ ok: true, submission });
  } catch (error) {
    console.error('POST /api/jobs/:id/forms error:', error);
    res.status(500).json({ error: 'Failed to start form' });
  }
}
