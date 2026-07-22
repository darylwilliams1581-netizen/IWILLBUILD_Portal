import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { jobFormSubmissions, profiles } from '../../../db/schema.js';
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

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    // Only Owner, Admin, Manager can delete
    const allowedRoles = ['owner', 'admin', 'manager'];
    if (!allowedRoles.includes(profile.role ?? '')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const submission = await db.query.jobFormSubmissions.findFirst({
      where: and(
        eq(jobFormSubmissions.id, id),
        eq(jobFormSubmissions.companyId, profile.companyId),
      ),
    });
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    await db.delete(jobFormSubmissions).where(eq(jobFormSubmissions.id, id));

    res.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/job-forms/:id error:', error);
    res.status(500).json({ error: 'Failed to delete submission' });
  }
}
