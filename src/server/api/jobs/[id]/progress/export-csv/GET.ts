/**
 * GET /api/jobs/:id/progress/export-csv
 * Downloads a CSV of all progress lines for a job.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobProgressLines, jobs, profiles } from '../../../../../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';

function esc(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
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

    const lines = await db
      .select()
      .from(jobProgressLines)
      .where(and(eq(jobProgressLines.jobId, jobId), eq(jobProgressLines.companyId, profile.companyId)))
      .orderBy(asc(jobProgressLines.id));

    const headerRow = ['Description', 'Qty', 'Unit', 'Rate', '% Complete', 'Progress Note'];
    const rows = [headerRow.join(',')];

    for (const l of lines) {
      rows.push([
        esc(l.description),
        esc(l.quantity),
        esc(l.unit),
        esc(l.rate),
        esc(l.percentComplete),
        esc(l.progressNote),
      ].join(','));
    }

    const csv = rows.join('\r\n');
    const filename = `job-${jobId}-progress.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err) {
    console.error('GET /api/jobs/:id/progress/export-csv error:', err);
    return res.status(500).json({ error: 'Export failed' });
  }
}
