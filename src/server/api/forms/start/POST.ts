/**
 * POST /api/forms/start
 * Creates a standalone form submission (not tied to a specific job).
 * Used by Studio "Complete Form" flow.
 *
 * Body: { templateId: number, jobId?: number }
 * Returns: { ok, submission }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { formTemplates, jobFormSubmissions, profiles } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const { templateId, jobId } = req.body as { templateId?: number; jobId?: number };
    if (!templateId) return res.status(400).json({ error: 'templateId required' });

    // Verify template belongs to company
    const template = await db.query.formTemplates.findFirst({
      where: and(
        eq(formTemplates.id, templateId),
        eq(formTemplates.companyId, profile.companyId),
        eq(formTemplates.isActive, true),
      ),
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const [result] = await db.insert(jobFormSubmissions).values({
      jobId:              jobId ?? 0,   // 0 = standalone (no job); DB column is NOT NULL
      companyId:          profile.companyId,
      templateId,
      completedByUserId:  session.user.id,
      completedByName:    session.user.name ?? 'Unknown',
      status:             'in_progress',
      answersJson:        null,
    });

    const submission = await db.query.jobFormSubmissions.findFirst({
      where: eq(jobFormSubmissions.id, result.insertId),
    });

    return res.status(201).json({ ok: true, submission });
  } catch (err) {
    console.error('POST /api/forms/start error:', err);
    return res.status(500).json({ error: 'Failed to start form' });
  }
}
