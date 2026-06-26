import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { jobs, profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
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

    const jobId = parseInt(String(req.params.id), 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const existing = await db.query.jobs.findFirst({ where: eq(jobs.id, jobId) });
    if (!existing) return res.status(404).json({ error: 'Job not found' });
    if (existing.companyId !== profile.companyId) return res.status(403).json({ error: 'Forbidden' });

    const { name, client, address, status, notes, jobNumber } = req.body as {
      name?: string;
      client?: string;
      address?: string;
      status?: string;
      notes?: string;
      jobNumber?: string;
    };

    await db.update(jobs).set({
      ...(name !== undefined && { name: name.trim() }),
      ...(client !== undefined && { client: client.trim() || null }),
      ...(address !== undefined && { address: address.trim() || null }),
      ...(status !== undefined && { status }),
      ...(notes !== undefined && { notes: notes.trim() || null }),
      ...(jobNumber !== undefined && { jobNumber: jobNumber.trim() || null }),
    }).where(eq(jobs.id, jobId));

    const updated = await db.query.jobs.findFirst({ where: eq(jobs.id, jobId) });
    res.json({ job: updated });
  } catch (error) {
    console.error('PUT /api/jobs/:id error:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
}
