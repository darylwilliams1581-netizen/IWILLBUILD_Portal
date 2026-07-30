/**
 * GET /api/jobs/:id/export-zip
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete job pack as a human-readable ZIP.
 * Auth required. Company isolation enforced.
 *
 * ZIP structure:
 *   README.txt
 *   job-summary.csv
 *   tasks.csv
 *   notes.csv
 *   attendance.csv
 *   delays.csv
 *   costs.csv
 *   estimates.csv
 *   estimate-lines.csv
 *   forms-submitted.csv
 *   photos-manifest.csv
 *   files-manifest.csv
 *   drawings-manifest.csv
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '(no records)\n';
  const cols = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    const s = v == null ? '' : String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [cols.join(',')];
  for (const row of rows) lines.push(cols.map(c => escape(row[c])).join(','));
  return lines.join('\n') + '\n';
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
        return (rows ?? []) as T[];
      } catch { return []; }
    };

    // Verify job belongs to this company
    const [jobRows] = await db.execute(
      sql`SELECT * FROM jobs WHERE id = ${jobId} AND company_id = ${cid} LIMIT 1`
    ) as unknown as [Record<string, unknown>[], unknown];
    const job = (jobRows ?? [])[0] as Record<string, unknown> | undefined;
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const [
      tasks, notes, attendance, delays, costs,
      estimates, estimateLines, forms,
      photos, files, drawings,
    ] = await Promise.all([
      safeQuery(sql`
        SELECT id, title, description, status, assigned_to_name, due_date, created_at
        FROM job_tasks WHERE job_id = ${jobId} AND company_id = ${cid} ORDER BY id`),

      safeQuery(sql`
        SELECT id, content, created_by_name, created_at
        FROM job_notes WHERE job_id = ${jobId} AND company_id = ${cid} ORDER BY created_at`),

      safeQuery(sql`
        SELECT id, user_name, role, sign_in_at, sign_out_at
        FROM job_attendance WHERE job_id = ${jobId} AND company_id = ${cid} ORDER BY sign_in_at`),

      safeQuery(sql`
        SELECT id, reason, delay_date, duration_hours, created_by_name, created_at
        FROM job_delays WHERE job_id = ${jobId} AND company_id = ${cid} ORDER BY delay_date`),

      safeQuery(sql`
        SELECT id, description, category, amount, supplier, cost_date, created_at
        FROM job_costs WHERE job_id = ${jobId} AND company_id = ${cid} ORDER BY cost_date`),

      safeQuery(sql`
        SELECT id, title, status, total_amount, created_at
        FROM estimates WHERE job_id = ${jobId} AND company_id = ${cid} ORDER BY id`),

      safeQuery(sql`
        SELECT el.id, e.title AS estimate_title, el.description,
               el.quantity, el.unit, el.rate, el.total, el.line_order
        FROM estimate_lines el
        JOIN estimates e ON e.id = el.estimate_id
        WHERE e.job_id = ${jobId} AND el.company_id = ${cid}
        ORDER BY el.estimate_id, el.line_order`),

      safeQuery(sql`
        SELECT fs.id, ft.name AS form_name, fs.completed_by_name,
               fs.status, fs.created_at
        FROM job_form_submissions fs
        LEFT JOIN form_templates ft ON ft.id = fs.template_id
        WHERE fs.job_id = ${jobId} AND fs.company_id = ${cid} ORDER BY fs.created_at`),

      safeQuery(sql`
        SELECT id, original_name, label, mime_type, size_bytes,
               uploaded_by_name, created_at
        FROM job_photos WHERE job_id = ${jobId} AND company_id = ${cid} ORDER BY created_at`),

      safeQuery(sql`
        SELECT id, original_name, file_category, label, mime_type, size_bytes, created_at
        FROM company_files WHERE job_id = ${jobId} AND company_id = ${cid} ORDER BY created_at`),

      safeQuery(sql`
        SELECT id, name AS drawing_name, original_name, mime_type, size_bytes, created_at
        FROM job_drawings WHERE job_id = ${jobId} AND company_id = ${cid} ORDER BY created_at`),
    ]);

    const exportedAt = new Date().toISOString();
    const jobNumber = String(job.job_number ?? job.id);
    const jobName = String(job.name ?? '');
    const dateStr = exportedAt.slice(0, 10);

    // ── Job summary as a single-row CSV ───────────────────────────────────────
    const jobSummaryCsv = toCsv([{
      job_number: job.job_number ?? '',
      name: job.name ?? '',
      status: job.status ?? '',
      client_name: job.client_name ?? '',
      site_address: job.site_address ?? '',
      start_date: job.start_date ?? '',
      end_date: job.end_date ?? '',
      description: job.description ?? '',
      created_at: job.created_at ?? '',
    }]);

    // ── README ────────────────────────────────────────────────────────────────
    const readme = [
      `IWILLBUILD — Job Pack`,
      `=====================`,
      ``,
      `Job Number:  ${jobNumber}`,
      `Job Name:    ${jobName}`,
      `Status:      ${job.status ?? ''}`,
      `Client:      ${job.client_name ?? ''}`,
      `Site:        ${job.site_address ?? ''}`,
      `Exported:    ${exportedAt}`,
      ``,
      `FILES IN THIS ARCHIVE`,
      `─────────────────────`,
      `README.txt              — this file`,
      `job-summary.csv         — job details`,
      `tasks.csv               — tasks / to-dos (${tasks.length} records)`,
      `notes.csv               — site notes (${notes.length} records)`,
      `attendance.csv          — sign-ins / sign-outs (${attendance.length} records)`,
      `delays.csv              — recorded delays (${delays.length} records)`,
      `costs.csv               — costs / expenses (${costs.length} records)`,
      `estimates.csv           — estimates / quotes (${estimates.length} records)`,
      `estimate-lines.csv      — estimate line items (${estimateLines.length} records)`,
      `forms-submitted.csv     — completed site forms (${forms.length} records)`,
      `photos-manifest.csv     — index of uploaded photos (${photos.length} files)`,
      `files-manifest.csv      — index of uploaded documents (${files.length} files)`,
      `drawings-manifest.csv   — index of uploaded drawings/plans (${drawings.length} files)`,
      ``,
      `ABOUT PHOTOS, FILES & DRAWINGS`,
      `──────────────────────────────`,
      `The manifest CSVs list every uploaded file with its name, size, and`,
      `upload date. The actual files are stored securely in cloud storage`,
      `and are not included in this ZIP to keep the download manageable.`,
      ``,
      `HOW TO OPEN CSV FILES`,
      `─────────────────────`,
      `Open any .csv file in Microsoft Excel, Google Sheets, or Apple Numbers.`,
      `In Excel: File → Open → browse to the .csv file.`,
      `In Google Sheets: File → Import → Upload.`,
      ``,
    ].join('\n');

    // ── Build ZIP ─────────────────────────────────────────────────────────────
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();

    zip.file('README.txt', readme);
    zip.file('job-summary.csv', jobSummaryCsv);
    zip.file('tasks.csv', toCsv(tasks as Record<string, unknown>[]));
    zip.file('notes.csv', toCsv(notes as Record<string, unknown>[]));
    zip.file('attendance.csv', toCsv(attendance as Record<string, unknown>[]));
    zip.file('delays.csv', toCsv(delays as Record<string, unknown>[]));
    zip.file('costs.csv', toCsv(costs as Record<string, unknown>[]));
    zip.file('estimates.csv', toCsv(estimates as Record<string, unknown>[]));
    zip.file('estimate-lines.csv', toCsv(estimateLines as Record<string, unknown>[]));
    zip.file('forms-submitted.csv', toCsv(forms as Record<string, unknown>[]));
    zip.file('photos-manifest.csv', toCsv(photos as Record<string, unknown>[]));
    zip.file('files-manifest.csv', toCsv(files as Record<string, unknown>[]));
    zip.file('drawings-manifest.csv', toCsv(drawings as Record<string, unknown>[]));

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const safeName = jobName.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-').slice(0, 40);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="iwillbuild-job-${jobNumber}-${safeName}-${dateStr}.zip"`);
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.send(zipBuffer);

  } catch (error) {
    console.error('GET /api/jobs/:id/export-zip error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Export failed' });
  }
}
