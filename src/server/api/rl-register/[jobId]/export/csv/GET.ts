/**
 * GET /api/rl-register/:jobId/export/csv
 * Export all RL points for a job as CSV.
 * Signed differences always include explicit + or − sign.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { calcDiffFromTarget, formatDiffShort, formatMmShort, evalTolerance } from '../../../../../../lib/rl-calc.js';

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

    const jobId = parseInt(req.params['jobId'] as string, 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid jobId' });

    // Verify job belongs to company
    const [jobRows] = await db.execute(sql.raw(
      `SELECT id, name, job_number FROM jobs WHERE id = ${jobId} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number; name: string; job_number: string }>];
    if (!jobRows?.length) return res.status(404).json({ error: 'Job not found' });

    const job = jobRows[0];

    const [rows] = await db.execute(sql.raw(`
      SELECT
        b.name              AS benchmarkName,
        b.rl                AS benchmarkRl,
        p.point_name        AS pointName,
        p.location,
        p.measured_rl       AS measuredRl,
        p.target_rl         AS targetRl,
        p.tolerance_mm      AS toleranceMm,
        p.rise_fall         AS riseFall,
        p.measurement_date  AS measurementDate,
        p.entered_by        AS enteredBy,
        p.method,
        p.notes
      FROM rl_points p
      JOIN rl_benchmarks b ON b.id = p.benchmark_id
      WHERE p.job_id = ${jobId}
        AND p.company_id = ${profile.companyId}
        AND p.archived_at IS NULL
      ORDER BY b.name ASC, p.created_at ASC
    `)) as unknown as [Array<Record<string, unknown>>];

    const csvRows: string[] = [
      `Job Site RL Register — ${job.name ?? ''} (${job.job_number ?? ''})`,
      '',
      'Benchmark,Benchmark RL (m),Point,Location,Measured RL (m),Target RL (m),Difference (m),Difference (mm),Result,Tolerance (mm),Rise/Fall (m),Date,Entered By,Method,Notes',
    ];

    for (const r of (rows ?? [])) {
      const measured = parseFloat(String(r['measuredRl'] ?? '0'));
      const target = r['targetRl'] !== null && r['targetRl'] !== undefined && r['targetRl'] !== ''
        ? parseFloat(String(r['targetRl'])) : null;
      const tolMm = r['toleranceMm'] !== null && r['toleranceMm'] !== undefined
        ? parseInt(String(r['toleranceMm']), 10) : 0;

      const diffM = target !== null ? calcDiffFromTarget(measured, target) : null;
      const diffStr = diffM !== null ? formatDiffShort(diffM) : '';
      const mmStr = diffM !== null ? formatMmShort(diffM) : '';
      const result = diffM !== null ? evalTolerance(measured, target!, tolMm) : '';

      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

      csvRows.push([
        esc(r['benchmarkName']),
        esc(parseFloat(String(r['benchmarkRl'] ?? '0')).toFixed(3)),
        esc(r['pointName']),
        esc(r['location']),
        esc(measured.toFixed(3)),
        esc(target !== null ? target.toFixed(3) : ''),
        esc(diffStr),
        esc(mmStr),
        esc(result),
        esc(r['toleranceMm'] ?? ''),
        esc(r['riseFall'] !== null && r['riseFall'] !== undefined ? parseFloat(String(r['riseFall'])).toFixed(3) : ''),
        esc(r['measurementDate']),
        esc(r['enteredBy']),
        esc(r['method']),
        esc(r['notes']),
      ].join(','));
    }

    const csv = csvRows.join('\n');
    const filename = `rl-register-job-${jobId}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send('\uFEFF' + csv); // BOM for Excel
  } catch (err) {
    console.error('GET /api/rl-register/:jobId/export/csv error:', err);
    return res.status(500).json({ error: 'Failed to export CSV' });
  }
}
