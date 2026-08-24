/**
 * GET /api/jobs/:id/progress/export-csv
 * Downloads a CSV of the Program of Works for a job.
 *
 * Columns: Seq, Section, Activity, Start, Finish, Duration, Progress %, Status, Responsible, Notes
 * Financial fields (Qty, Unit, Rate) are intentionally excluded.
 * CSV injection guard applied to all string cells.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobProgressLines, jobProgressSections, jobs, profiles } from '../../../../../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { calcStatus, calcDuration, csvEsc, todayISO } from '../../../../../../lib/pow-types.js';

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

    const [sections, activities] = await Promise.all([
      db.select().from(jobProgressSections)
        .where(and(eq(jobProgressSections.jobId, jobId), eq(jobProgressSections.companyId, profile.companyId)))
        .orderBy(asc(jobProgressSections.sortOrder), asc(jobProgressSections.id)),
      db.select().from(jobProgressLines)
        .where(and(eq(jobProgressLines.jobId, jobId), eq(jobProgressLines.companyId, profile.companyId)))
        .orderBy(asc(jobProgressLines.sortOrder), asc(jobProgressLines.id)),
    ]);

    const sectionMap = new Map(sections.map((s) => [s.id, s.title]));
    const today = todayISO();

    const headerRow = ['Seq', 'Section', 'Activity', 'Start', 'Finish', 'Duration', 'Progress %', 'Status', 'Responsible', 'Notes'];
    const rows = [headerRow.join(',')];

    activities.forEach((a, idx) => {
      const sectionTitle = a.sectionId ? (sectionMap.get(a.sectionId) ?? 'Unsectioned') : 'Unsectioned';
      const dur = calcDuration(a.startDate, a.endDate);
      const durStr = dur !== null ? `${dur} day${dur === 1 ? '' : 's'}` : '';
      const status = calcStatus(a.percentComplete, a.endDate, today);
      const responsible = a.assignedToName ?? a.tradeType ?? '';
      rows.push([
        csvEsc(idx + 1),
        csvEsc(sectionTitle),
        csvEsc(a.description),
        csvEsc(a.startDate ?? ''),
        csvEsc(a.endDate ?? ''),
        csvEsc(durStr),
        csvEsc(a.percentComplete),
        csvEsc(status),
        csvEsc(responsible),
        csvEsc(a.progressNote ?? ''),
      ].join(','));
    });

    const csv = rows.join('\r\n');
    const filename = `job-${jobId}-program-of-works.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // BOM for Excel
  } catch (err) {
    console.error('GET /api/jobs/:id/progress/export-csv error:', err);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
}
