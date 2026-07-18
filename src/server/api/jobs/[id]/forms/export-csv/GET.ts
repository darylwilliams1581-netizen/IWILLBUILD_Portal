/**
 * GET /api/jobs/:id/forms/export-csv
 * Downloads a CSV of all form submissions for a job.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobFormSubmissions, formTemplates, jobs, profiles } from '../../../../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
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

    const submissions = await db.query.jobFormSubmissions.findMany({
      where: and(
        eq(jobFormSubmissions.jobId, jobId),
        eq(jobFormSubmissions.companyId, profile.companyId),
      ),
      orderBy: [desc(jobFormSubmissions.createdAt)],
    });

    // Fetch template names
    const templateIds = [...new Set(submissions.map(s => s.templateId).filter(Boolean))] as number[];
    const templates = templateIds.length
      ? await db.query.formTemplates.findMany({
          where: eq(formTemplates.companyId, profile.companyId),
        })
      : [];
    const templateMap = new Map(templates.map(t => [t.id, t.name]));

    const headerRow = ['Form Name', 'Completed By', 'Status', 'Date', 'Answers (JSON)'];
    const lines = [headerRow.join(',')];

    for (const s of submissions) {
      lines.push([
        esc(s.templateId ? (templateMap.get(s.templateId) ?? `Template #${s.templateId}`) : 'Unknown'),
        esc(s.completedByName ?? s.completedByUserId),
        esc(s.status),
        esc(s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 10) : ''),
        esc(s.answersJson ?? ''),
      ].join(','));
    }

    const csv = lines.join('\r\n');
    const filename = `job-${jobId}-forms.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err) {
    console.error('GET /api/jobs/:id/forms/export-csv error:', err);
    return res.status(500).json({ error: 'Export failed' });
  }
}
