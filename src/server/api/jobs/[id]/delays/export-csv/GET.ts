/**
 * GET /api/jobs/:id/delays/export-csv
 * Export all delay entries for a job as CSV.
 */
import type { Request, Response } from 'express';
import { getAuth } from '@/lib/auth/auth.js';
import { db } from '../../../../../db/client.js';
import { profiles, jobs } from '../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

function escapeCsv(val: unknown): string {
  const s = val == null ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(cols: unknown[]): string {
  return cols.map(escapeCsv).join(',');
}

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

    const jobId = parseInt(String(req.params.id), 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const [rows] = await db.execute(
      sql`SELECT id, reason, days, delay_date, notes, created_by_name, created_at, updated_at
          FROM job_delays
          WHERE job_id = ${jobId} AND company_id = ${profile.companyId}
          ORDER BY delay_date DESC, created_at DESC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const delays = rows ?? [];
    const totalDays = delays.reduce((sum, d) => sum + parseFloat(String(d.days ?? 0)), 0);

    const lines: string[] = [];
    lines.push(`Job,${escapeCsv(job.name)}`);
    lines.push(`Job Number,${escapeCsv(job.jobNumber ?? '')}`);
    lines.push(`Total Delay Days,${Math.round(totalDays * 100) / 100}`);
    lines.push(`Exported,${new Date().toLocaleDateString('en-AU')}`);
    lines.push('');
    lines.push(row(['ID', 'Date', 'Reason', 'Days', 'Notes', 'Logged By', 'Created At']));
    for (const d of delays) {
      lines.push(row([d.id, d.delay_date, d.reason, d.days, d.notes, d.created_by_name, d.created_at]));
    }

    const csv = lines.join('\n');
    const filename = `job-${jobId}-delays-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('GET /api/jobs/:id/delays/export-csv error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
}
