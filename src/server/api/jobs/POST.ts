import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { jobs, profiles } from '../../db/schema.js';
import { eq, count, sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { getPlanLimits, getCompanyPlan, checkLimit } from '../../lib/plan-limits.js';

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

    // ── Plan limit check: active jobs ─────────────────────────────────────────
    const plan = await getCompanyPlan(profile.companyId);
    const limits = await getPlanLimits(profile.companyId, plan);

    const [activeCountRow] = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM jobs WHERE company_id = ${profile.companyId} AND status NOT IN ('Archived','Closed')`
    ) as unknown as [Array<{ cnt: number }>, unknown];
    const activeCount = Number(activeCountRow?.[0]?.cnt ?? 0);

    const limitCheck = checkLimit(activeCount, limits.activeJobs, 'Active Jobs');
    if (!limitCheck.allowed) {
      return res.status(403).json({ code: limitCheck.code, error: limitCheck.message });
    }

    const { name, client, address, status, notes, jobNumber, customerId } = req.body as {
      name: string;
      client?: string;
      address?: string;
      status?: string;
      notes?: string;
      jobNumber?: string;
      customerId?: number | null;
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

    // If customerId provided, update via raw SQL (not in Drizzle schema yet)
    if (customerId) {
      const { sql: rawSql } = await import('drizzle-orm');
      await db.execute(rawSql`UPDATE jobs SET customer_id = ${customerId} WHERE id = ${result.insertId}`);
    }

    const newJob = await db.query.jobs.findFirst({
      where: eq(jobs.id, result.insertId),
    });

    res.status(201).json({ job: newJob });
  } catch (error) {
    console.error('POST /api/jobs error:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
}
