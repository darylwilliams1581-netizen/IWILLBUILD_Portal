/**
 * GET /api/rl-register/:benchmarkId/points
 * List all active RL points for a benchmark.
 * Company-scoped via benchmark → job → company.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
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

    const benchmarkId = parseInt(req.params['benchmarkId'] as string, 10);
    if (isNaN(benchmarkId)) return res.status(400).json({ error: 'Invalid benchmarkId' });

    // Verify benchmark belongs to company
    const [bmRows] = await db.execute(sql.raw(
      `SELECT id, company_id FROM rl_benchmarks WHERE id = ${benchmarkId} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number; company_id: number }>];
    if (!bmRows?.length) return res.status(404).json({ error: 'Benchmark not found' });

    const includeArchived = req.query['archived'] === '1';
    const archivedClause = includeArchived ? '' : 'AND p.archived_at IS NULL';

    const [rows] = await db.execute(sql.raw(`
      SELECT
        p.id,
        p.benchmark_id      AS benchmarkId,
        p.company_id        AS companyId,
        p.job_id            AS jobId,
        p.point_name        AS pointName,
        p.location,
        p.measured_rl       AS measuredRl,
        p.target_rl         AS targetRl,
        p.tolerance_mm      AS toleranceMm,
        p.rise_fall         AS riseFall,
        p.measurement_date  AS measurementDate,
        p.entered_by        AS enteredBy,
        p.method,
        p.notes,
        p.photo_path        AS photoPath,
        p.archived_at       AS archivedAt,
        p.created_by_user_id AS createdByUserId,
        p.created_at        AS createdAt,
        p.updated_at        AS updatedAt
      FROM rl_points p
      WHERE p.benchmark_id = ${benchmarkId}
        AND p.company_id = ${profile.companyId}
        ${archivedClause}
      ORDER BY p.created_at ASC
    `)) as unknown as [Array<Record<string, unknown>>];

    return res.json({ points: rows ?? [] });
  } catch (err) {
    console.error('GET /api/rl-register/:benchmarkId/points error:', err);
    return res.status(500).json({ error: 'Failed to fetch RL points' });
  }
}
