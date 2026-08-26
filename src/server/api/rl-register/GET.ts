/**
 * GET /api/rl-register?jobId=<n>
 * List all RL registers (benchmarks + point counts) for a job.
 * Company-scoped. Returns only non-archived benchmarks by default.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
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

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const jobId = req.query['jobId'] ? parseInt(req.query['jobId'] as string, 10) : null;
    if (jobId !== null && isNaN(jobId)) return res.status(400).json({ error: 'Invalid jobId' });

    const jobClause = jobId !== null ? `AND b.job_id = ${jobId}` : '';

    const [rows] = await db.execute(sql.raw(`
      SELECT
        b.id,
        b.company_id        AS companyId,
        b.job_id            AS jobId,
        b.name,
        b.rl                AS rl,
        b.description,
        b.location,
        b.date_established  AS dateEstablished,
        b.entered_by        AS enteredBy,
        b.notes,
        b.photo_path        AS photoPath,
        b.archived_at       AS archivedAt,
        b.created_by_user_id AS createdByUserId,
        b.created_at        AS createdAt,
        b.updated_at        AS updatedAt,
        (SELECT COUNT(*) FROM rl_points p
          WHERE p.benchmark_id = b.id AND p.archived_at IS NULL) AS pointCount
      FROM rl_benchmarks b
      WHERE b.company_id = ${profile.companyId}
        AND b.archived_at IS NULL
        ${jobClause}
      ORDER BY b.created_at DESC
    `)) as unknown as [Array<Record<string, unknown>>];

    return res.json({ benchmarks: rows ?? [] });
  } catch (err) {
    console.error('GET /api/rl-register error:', err);
    return res.status(500).json({ error: 'Failed to fetch RL register' });
  }
}
