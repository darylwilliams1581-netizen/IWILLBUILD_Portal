/**
 * GET /api/jobs/search
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight job search for the dashboard photo uploader job selector.
 * Returns id, jobNumber, name, status for jobs in the caller's company.
 *
 * Query params:
 *   q        — search string (matches job number or name, case-insensitive)
 *   status   — optional filter: 'active' (excludes Completed/Cancelled)
 *   limit    — max results (default 20, max 50)
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { jobs, profiles } from '../../../db/schema.js';
import { eq, and, or, like, notInArray } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

const INACTIVE_STATUSES = ['Completed', 'Cancelled', 'Archived'];

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

    const q = String(req.query.q ?? '').trim();
    const statusFilter = String(req.query.status ?? '');
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));

    const conditions = [eq(jobs.companyId, profile.companyId)];

    if (statusFilter === 'active') {
      conditions.push(notInArray(jobs.status, INACTIVE_STATUSES));
    }

    if (q) {
      conditions.push(
        or(
          like(jobs.name, `%${q}%`),
          like(jobs.jobNumber, `%${q}%`),
        )!,
      );
    }

    const rows = await db
      .select({
        id: jobs.id,
        jobNumber: jobs.jobNumber,
        name: jobs.name,
        status: jobs.status,
      })
      .from(jobs)
      .where(and(...conditions))
      .orderBy(jobs.updatedAt)
      .limit(limit);

    return res.json({ jobs: rows });
  } catch (err) {
    console.error('GET /api/jobs/search error:', err);
    return res.status(500).json({ error: 'Failed to search jobs.' });
  }
}
