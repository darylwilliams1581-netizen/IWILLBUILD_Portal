import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { jobs, profiles } from '../../db/schema.js';
import { eq, count } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

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
    if (!profile?.companyId) return res.status(400).json({ error: 'No company found for user' });

    const { name, client, address, status, notes, jobNumber } = req.body as {
      name: string;
      client?: string;
      address?: string;
      status?: string;
      notes?: string;
      jobNumber?: string;
    };

    if (!name?.trim()) return res.status(400).json({ error: 'Job title is required' });

    // Auto-generate job number if not provided
    let finalJobNumber = jobNumber?.trim();
    if (!finalJobNumber) {
      const [row] = await db
        .select({ total: count() })
        .from(jobs)
        .where(eq(jobs.companyId, profile.companyId));
      const nextNum = (row?.total ?? 0) + 1;
      finalJobNumber = `JOB-${String(nextNum).padStart(3, '0')}`;
    }

    const [result] = await db.insert(jobs).values({
      companyId: profile.companyId,
      jobNumber: finalJobNumber,
      name: name.trim(),
      client: client?.trim() || null,
      address: address?.trim() || null,
      status: status || 'New',
      notes: notes?.trim() || null,
    });

    const newJob = await db.query.jobs.findFirst({
      where: eq(jobs.id, result.insertId),
    });

    res.status(201).json({ job: newJob });
  } catch (error) {
    console.error('POST /api/jobs error:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
}
