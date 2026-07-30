/**
 * GET /api/jobs/:id/export-zip
 * ─────────────────────────────────────────────────────────────────────────────
 * Exports a complete job pack as a ZIP.
 * Auth required. Company isolation enforced.
 *
 * ZIP contents:
 *   job-summary.json
 *   job-details.csv
 *   tasks.csv
 *   notes.csv
 *   attendance.csv
 *   delays.csv
 *   costs.csv
 *   photos/  (manifest CSV — actual blobs not included)
 *   files/   (manifest CSV)
 *   drawings/ (manifest CSV)
 *   forms/   (manifest CSV)
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return 'no records\n';
  const cols = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [cols.join(','), ...rows.map(r => cols.map(c => escape(r[c])).join(','))].join('\n');
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

    const jobId = parseInt(req.params.id, 10);
    if (!jobId) return res.status(400).json({ error: 'Invalid job id' });

    const cid = profile.companyId;

    const safeQuery = async <T>(q: ReturnType<typeof sql>): Promise<T[]> => {
      try {
        const [rows] = await db.execute(q) as unknown as [T[], unknown];
        return rows ?? [];
      } catch { return []; }
    };

    // Verify job belongs to this company
    const [jobRows] = await db.execute(sql`SELECT * FROM jobs WHERE id = ${jobId} AND company_id = ${cid} LIMIT 1`) as unknown as [Record<string, unknown>[], unknown];
    const job = (jobRows ?? [])[0] as Record<string, unknown> | undefined;
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const [tasks, notes, attendance, delays, costs, photos, files, drawings, forms] = await Promise.all([
      safeQuery(sql`SELECT id, title, status, assigned_to_name, due_date, created_at FROM job_tasks WHERE job_id = ${jobId} AND company_id = ${cid} ORDER BY id`),
      safeQuery(sql`SELECT id, content, created_by_name, created_at FROM job_notes WHERE job_id = ${jobId} AND company_id = ${cid} ORDER BY created_at`),
      safeQuery(sql`SELECT id, user_name, sign_in_at, sign_out_at, role FROM job_attendance WHERE job_id = ${jobId} AND company_id = ${cid} ORDER BY sign_in_at`),
      safeQuery(sql`SELECT id, reason, delay_date, duration_hours, created_by_name, created_at FROM job_delays WHERE job_id = ${jobId} AND company_id = ${cid} ORDER BY delay_date`),
      safeQuery(sql`SELECT id, description, category, amount, supplier, cost_date, created_at FROM job_costs WHERE job_id = ${jobId} AND company_id = ${cid} ORDER BY cost_date`),
      safeQuery(sql`SELECT id, filename, original_name, label, mime_type, size_bytes, uploaded_by_name, created_at FROM job_photos WHERE job_id = ${jobId} AND company_id = ${cid} ORDER BY created_at`),
      safeQuery(sql`SELECT id, original_name, stored_name, mime_type, size_bytes, file_category, label, created_at FROM company_files WHERE job_id = ${jobId} AND company_id = ${cid} ORDER BY created_at`),
      safeQuery(sql`SELECT id, name, original_name, mime_type, size_bytes, created_at FROM job_drawings WHERE job_id = ${jobId} AND company_id = ${cid} ORDER BY created_at`),
      safeQuery(sql`SELECT id, template_id, completed_by_name, status, created_at FROM job_form_submissions WHERE job_id = ${jobId} AND company_id = ${cid} ORDER BY created_at`),
    ]);

    const exportedAt = new Date().toISOString();
    const jobNumber = String(job.job_number ?? job.id);
    const jobName = String(job.name ?? '');

    const summary = {
      exportedAt,
      job: { ...job },
      counts: {
        tasks: tasks.length,
        notes: notes.length,
        attendance: attendance.length,
        delays: delays.length,
        costs: costs.length,
        photos: photos.length,
        files: files.length,
        drawings: drawings.length,
        forms: forms.length,
      },
    };

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    zip.file('job-summary.json', JSON.stringify(summary, null, 2));
    zip.file('job-details.csv', toCsv([job]));
    zip.file('tasks.csv', toCsv(tasks as Record<string, unknown>[]));
    zip.file('notes.csv', toCsv(notes as Record<string, unknown>[]));
    zip.file('attendance.csv', toCsv(attendance as Record<string, unknown>[]));
    zip.file('delays.csv', toCsv(delays as Record<string, unknown>[]));
    zip.file('costs.csv', toCsv(costs as Record<string, unknown>[]));
    zip.file('photos/photos-manifest.csv', toCsv(photos as Record<string, unknown>[]));
    zip.file('files/files-manifest.csv', toCsv(files as Record<string, unknown>[]));
    zip.file('drawings/drawings-manifest.csv', toCsv(drawings as Record<string, unknown>[]));
    zip.file('forms/forms-manifest.csv', toCsv(forms as Record<string, unknown>[]));

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const dateStr = new Date().toISOString().slice(0, 10);
    const safeName = jobName.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 40);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="iwillbuild-job-${jobNumber}-${safeName}-${dateStr}.zip"`);
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.send(zipBuffer);
  } catch (error) {
    console.error('GET /api/jobs/:id/export-zip error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Export failed' });
  }
}
