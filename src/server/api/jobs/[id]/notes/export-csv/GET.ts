/**
 * GET /api/jobs/:id/notes/export-csv
 * Export all notes + tasks for a job as CSV.
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

    // Fetch notes
    const [notesRows] = await db.execute(sql.raw(
      `SELECT id, note_type, body, author_name, created_at
       FROM entity_notes
       WHERE company_id = ${profile.companyId} AND entity_type = 'job' AND entity_id = ${jobId}
       ORDER BY created_at DESC`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    // Fetch tasks
    const [taskRows] = await db.execute(sql.raw(
      `SELECT id, note_type, note_body, created_by_name, assignee_name, status, due_date, created_at, completed_at
       FROM note_tag_tasks
       WHERE company_id = ${profile.companyId} AND entity_type = 'job' AND entity_id = ${jobId}
       ORDER BY created_at DESC`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    const lines: string[] = [];

    // Notes section
    lines.push('NOTES');
    lines.push(row(['ID', 'Type', 'Author', 'Body', 'Created At']));
    for (const n of (notesRows ?? [])) {
      lines.push(row([n.id, n.note_type, n.author_name, n.body, n.created_at]));
    }

    lines.push('');

    // Tasks section
    lines.push('TASKS');
    lines.push(row(['ID', 'Type', 'Created By', 'Assignee', 'Body', 'Status', 'Due Date', 'Created At', 'Completed At']));
    for (const t of (taskRows ?? [])) {
      lines.push(row([t.id, t.note_type, t.created_by_name, t.assignee_name, t.note_body, t.status, t.due_date, t.created_at, t.completed_at]));
    }

    const csv = lines.join('\n');
    const filename = `job-${jobId}-notes-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('GET /api/jobs/:id/notes/export-csv error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
}
