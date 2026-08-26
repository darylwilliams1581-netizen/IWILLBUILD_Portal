/**
 * POST /api/rl-register/:benchmarkId/points
 * Create a new RL point under a benchmark.
 * All authenticated members can add points.
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
      `SELECT id, job_id, company_id FROM rl_benchmarks WHERE id = ${benchmarkId} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number; job_id: number; company_id: number }>];
    if (!bmRows?.length) return res.status(404).json({ error: 'Benchmark not found' });

    const bm = bmRows[0];

    const {
      pointName, location, measuredRl, targetRl, toleranceMm,
      riseFall, measurementDate, enteredBy, method, notes,
    } = req.body as Record<string, unknown>;

    if (!pointName || measuredRl === undefined || measuredRl === null || measuredRl === '') {
      return res.status(400).json({ error: 'pointName and measuredRl are required' });
    }

    const measuredNum = parseFloat(String(measuredRl));
    if (isNaN(measuredNum)) return res.status(400).json({ error: 'measuredRl must be a valid number' });

    const targetNum = targetRl !== undefined && targetRl !== null && targetRl !== ''
      ? parseFloat(String(targetRl)) : null;
    if (targetNum !== null && isNaN(targetNum)) return res.status(400).json({ error: 'targetRl must be a valid number' });

    const tolNum = toleranceMm !== undefined && toleranceMm !== null && toleranceMm !== ''
      ? parseInt(String(toleranceMm), 10) : null;

    const rfNum = riseFall !== undefined && riseFall !== null && riseFall !== ''
      ? parseFloat(String(riseFall)) : null;

    const VALID_METHODS = ['laser_level', 'dumpy', 'total_station', 'gnss', 'other'];
    const methodVal = VALID_METHODS.includes(String(method)) ? String(method) : 'other';

    const [result] = await db.execute(sql.raw(`
      INSERT INTO rl_points
        (benchmark_id, company_id, job_id, point_name, location, measured_rl,
         target_rl, tolerance_mm, rise_fall, measurement_date, entered_by,
         method, notes, created_by_user_id)
      VALUES
        (${benchmarkId}, ${profile.companyId}, ${bm.job_id},
         ${JSON.stringify(String(pointName))},
         ${location ? JSON.stringify(String(location)) : 'NULL'},
         ${measuredNum},
         ${targetNum !== null ? targetNum : 'NULL'},
         ${tolNum !== null ? tolNum : 'NULL'},
         ${rfNum !== null ? rfNum : 'NULL'},
         ${measurementDate ? JSON.stringify(String(measurementDate)) : 'NULL'},
         ${enteredBy ? JSON.stringify(String(enteredBy)) : 'NULL'},
         ${JSON.stringify(methodVal)},
         ${notes ? JSON.stringify(String(notes)) : 'NULL'},
         ${JSON.stringify(session.user.id)})
    `)) as unknown as [{ insertId?: number }];

    const newId = (result as unknown as { insertId?: number })?.insertId;
    return res.status(201).json({ ok: true, id: newId });
  } catch (err) {
    console.error('POST /api/rl-register/:benchmarkId/points error:', err);
    return res.status(500).json({ error: 'Failed to create RL point' });
  }
}
