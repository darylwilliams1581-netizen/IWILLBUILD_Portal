/**
 * GET /api/settings/backup/export
 * ─────────────────────────────────────────────────────────────────────────────
 * Full company backup — human-readable CSV files + README.
 * Auth required. Owner/Admin only.
 *
 * ZIP structure:
 *   README.txt
 *   company-summary.csv
 *   jobs.csv
 *   tasks.csv
 *   notes.csv
 *   attendance.csv
 *   delays.csv
 *   costs.csv
 *   estimates.csv
 *   estimate-lines.csv
 *   forms-submitted.csv
 *   incidents.csv
 *   risk-register.csv
 *   fleet.csv
 *   users.csv
 *   photos-manifest.csv   (index of uploaded photos — actual files stored in cloud)
 *   files-manifest.csv    (index of uploaded documents)
 *   drawings-manifest.csv (index of uploaded drawings/plans)
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

// ── CSV helper ────────────────────────────────────────────────────────────────

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

// ── Handler ───────────────────────────────────────────────────────────────────

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

    const isOwner = profile.role === 'owner';
    const isAdmin = isOwner || profile.role === 'admin' || profile.permAdmin === true;
    const isAccounts = profile.role === 'accounts';
    const canBackup = isAdmin || isAccounts;
    if (!canBackup) {
      return res.status(403).json({ error: 'Owner, Admin, or Accounts access required to export company data.' });
    }

    const cid = profile.companyId;

    const safeQuery = async <T>(q: ReturnType<typeof sql>): Promise<T[]> => {
      try {
        const [rows] = await db.execute(q) as unknown as [T[], unknown];
        return (rows ?? []) as T[];
      } catch { return []; }
    };

    // ── Fetch all tables in parallel ──────────────────────────────────────────

    const [
      companyRows,
      jobRows,
      taskRows,
      noteRows,
      attendanceRows,
      delayRows,
      costRows,
      estimateRows,
      estimateLineRows,
      formSubmissionRows,
      incidentRows,
      riskRows,
      fleetRows,
      userRows,
      photoRows,
      fileRows,
      drawingRows,
    ] = await Promise.all([
      safeQuery(sql`
        SELECT id, name, abn, phone, email, address, created_at
        FROM companies WHERE id = ${cid} LIMIT 1`),

      safeQuery(sql`
        SELECT id, job_number, name, status, client_name, site_address,
               start_date, end_date, description, created_at, updated_at
        FROM jobs WHERE company_id = ${cid} ORDER BY id`),

      safeQuery(sql`
        SELECT t.id, j.job_number, j.name AS job_name, t.title, t.description,
               t.status, t.assigned_to_name, t.due_date, t.created_at
        FROM job_tasks t
        LEFT JOIN jobs j ON j.id = t.job_id
        WHERE t.company_id = ${cid} ORDER BY t.job_id, t.id`),

      safeQuery(sql`
        SELECT n.id, j.job_number, j.name AS job_name, n.content,
               n.created_by_name, n.created_at
        FROM job_notes n
        LEFT JOIN jobs j ON j.id = n.job_id
        WHERE n.company_id = ${cid} ORDER BY n.job_id, n.created_at`),

      safeQuery(sql`
        SELECT a.id, j.job_number, j.name AS job_name, a.user_name,
               a.role, a.sign_in_at, a.sign_out_at
        FROM job_attendance a
        LEFT JOIN jobs j ON j.id = a.job_id
        WHERE a.company_id = ${cid} ORDER BY a.sign_in_at`),

      safeQuery(sql`
        SELECT d.id, j.job_number, j.name AS job_name, d.reason,
               d.delay_date, d.duration_hours, d.created_by_name, d.created_at
        FROM job_delays d
        LEFT JOIN jobs j ON j.id = d.job_id
        WHERE d.company_id = ${cid} ORDER BY d.delay_date`),

      safeQuery(sql`
        SELECT c.id, j.job_number, j.name AS job_name, c.description,
               c.category, c.amount, c.supplier, c.cost_date, c.created_at
        FROM job_costs c
        LEFT JOIN jobs j ON j.id = c.job_id
        WHERE c.company_id = ${cid} ORDER BY c.cost_date`),

      safeQuery(sql`
        SELECT e.id, j.job_number, j.name AS job_name, e.title,
               e.status, e.total_amount, e.created_at
        FROM estimates e
        LEFT JOIN jobs j ON j.id = e.job_id
        WHERE e.company_id = ${cid} ORDER BY e.id`),

      safeQuery(sql`
        SELECT el.id, e.title AS estimate_title, j.job_number,
               el.description, el.quantity, el.unit, el.rate, el.total,
               el.line_order
        FROM estimate_lines el
        LEFT JOIN estimates e ON e.id = el.estimate_id
        LEFT JOIN jobs j ON j.id = e.job_id
        WHERE el.company_id = ${cid} ORDER BY el.estimate_id, el.line_order`),

      safeQuery(sql`
        SELECT fs.id, j.job_number, j.name AS job_name,
               ft.name AS form_name, fs.completed_by_name,
               fs.status, fs.created_at
        FROM job_form_submissions fs
        LEFT JOIN jobs j ON j.id = fs.job_id
        LEFT JOIN form_templates ft ON ft.id = fs.template_id
        WHERE fs.company_id = ${cid} ORDER BY fs.created_at`),

      safeQuery(sql`
        SELECT i.id, j.job_number, i.incident_date, i.severity, i.status,
               i.description, i.reported_by, i.location,
               i.corrective_actions, i.created_at
        FROM incidents i
        LEFT JOIN jobs j ON j.id = i.job_id
        WHERE i.company_id = ${cid} AND i.archived_at IS NULL
        ORDER BY i.incident_date DESC`),

      safeQuery(sql`
        SELECT r.id, j.job_number, r.title, r.category,
               r.likelihood, r.consequence, r.risk_level, r.status,
               r.responsible_person, r.due_date, r.identified_date
        FROM risk_register r
        LEFT JOIN jobs j ON j.id = r.job_id
        WHERE r.company_id = ${cid} AND r.archived_at IS NULL
        ORDER BY r.id`),

      safeQuery(sql`
        SELECT id, asset_number, name, category, status,
               make, model, year, rego, notes, created_at
        FROM fleet_assets WHERE company_id = ${cid} ORDER BY id`),

      safeQuery(sql`
        SELECT p.id, u.name, u.email, p.role, p.status, p.created_at
        FROM profiles p
        JOIN \`user\` u ON u.id = p.user_id
        WHERE p.company_id = ${cid} ORDER BY p.role, u.name`),

      safeQuery(sql`
        SELECT p.id, j.job_number, j.name AS job_name,
               p.original_name, p.label, p.mime_type, p.size_bytes,
               p.uploaded_by_name, p.created_at
        FROM job_photos p
        LEFT JOIN jobs j ON j.id = p.job_id
        WHERE p.company_id = ${cid} ORDER BY p.job_id, p.created_at`),

      safeQuery(sql`
        SELECT f.id, j.job_number, j.name AS job_name,
               f.original_name, f.file_category, f.label,
               f.mime_type, f.size_bytes, f.created_at
        FROM company_files f
        LEFT JOIN jobs j ON j.id = f.job_id
        WHERE f.company_id = ${cid} ORDER BY f.job_id, f.created_at`),

      safeQuery(sql`
        SELECT d.id, j.job_number, j.name AS job_name,
               d.name AS drawing_name, d.original_name,
               d.mime_type, d.size_bytes, d.created_at
        FROM job_drawings d
        LEFT JOIN jobs j ON j.id = d.job_id
        WHERE d.company_id = ${cid} ORDER BY d.job_id, d.created_at`),
    ]);

    // ── README ────────────────────────────────────────────────────────────────

    const exportedAt = new Date().toISOString();
    const company = (companyRows[0] ?? {}) as Record<string, unknown>;
    const companyName = String(company.name ?? 'Your Company');
    const dateStr = exportedAt.slice(0, 10);

    const readme = [
      `IWILLBUILD — Data Backup`,
      `========================`,
      ``,
      `Company:     ${companyName}`,
      `Exported:    ${exportedAt}`,
      ``,
      `FILES IN THIS ARCHIVE`,
      `─────────────────────`,
      `README.txt              — this file`,
      `company-summary.csv     — company name, ABN, contact details`,
      `jobs.csv                — all jobs (${jobRows.length} records)`,
      `tasks.csv               — job tasks / to-dos (${taskRows.length} records)`,
      `notes.csv               — job notes (${noteRows.length} records)`,
      `attendance.csv          — site sign-ins / sign-outs (${attendanceRows.length} records)`,
      `delays.csv              — recorded delays (${delayRows.length} records)`,
      `costs.csv               — job costs / expenses (${costRows.length} records)`,
      `estimates.csv           — estimates / quotes (${estimateRows.length} records)`,
      `estimate-lines.csv      — line items for each estimate (${estimateLineRows.length} records)`,
      `forms-submitted.csv     — completed site forms (${formSubmissionRows.length} records)`,
      `incidents.csv           — incident register (${incidentRows.length} records)`,
      `risk-register.csv       — risk register (${riskRows.length} records)`,
      `fleet.csv               — fleet / assets (${fleetRows.length} records)`,
      `users.csv               — team members (${userRows.length} records)`,
      `photos-manifest.csv     — index of uploaded photos (${photoRows.length} files)`,
      `files-manifest.csv      — index of uploaded documents (${fileRows.length} files)`,
      `drawings-manifest.csv   — index of uploaded drawings/plans (${drawingRows.length} files)`,
      ``,
      `ABOUT PHOTOS, FILES & DRAWINGS`,
      `──────────────────────────────`,
      `The manifest CSVs list every uploaded file with its job number, name,`,
      `size, and upload date. The actual photo and document files are stored`,
      `securely in cloud storage and are not included in this ZIP to keep the`,
      `download size manageable. Contact support if you need a full media export.`,
      ``,
      `HOW TO OPEN CSV FILES`,
      `─────────────────────`,
      `Open any .csv file in Microsoft Excel, Google Sheets, or Apple Numbers.`,
      `In Excel: File → Open → browse to the .csv file.`,
      `In Google Sheets: File → Import → Upload.`,
      ``,
      `SUPPORT`,
      `───────`,
      `iwillbuild.com`,
      ``,
    ].join('\n');

    // ── Build ZIP ─────────────────────────────────────────────────────────────

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();

    zip.file('README.txt', readme);
    zip.file('company-summary.csv', toCsv(companyRows as Record<string, unknown>[]));
    zip.file('jobs.csv', toCsv(jobRows as Record<string, unknown>[]));
    zip.file('tasks.csv', toCsv(taskRows as Record<string, unknown>[]));
    zip.file('notes.csv', toCsv(noteRows as Record<string, unknown>[]));
    zip.file('attendance.csv', toCsv(attendanceRows as Record<string, unknown>[]));
    zip.file('delays.csv', toCsv(delayRows as Record<string, unknown>[]));
    zip.file('costs.csv', toCsv(costRows as Record<string, unknown>[]));
    zip.file('estimates.csv', toCsv(estimateRows as Record<string, unknown>[]));
    zip.file('estimate-lines.csv', toCsv(estimateLineRows as Record<string, unknown>[]));
    zip.file('forms-submitted.csv', toCsv(formSubmissionRows as Record<string, unknown>[]));
    zip.file('incidents.csv', toCsv(incidentRows as Record<string, unknown>[]));
    zip.file('risk-register.csv', toCsv(riskRows as Record<string, unknown>[]));
    zip.file('fleet.csv', toCsv(fleetRows as Record<string, unknown>[]));
    zip.file('users.csv', toCsv(userRows as Record<string, unknown>[]));
    zip.file('photos-manifest.csv', toCsv(photoRows as Record<string, unknown>[]));
    zip.file('files-manifest.csv', toCsv(fileRows as Record<string, unknown>[]));
    zip.file('drawings-manifest.csv', toCsv(drawingRows as Record<string, unknown>[]));

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="iwillbuild-backup-${dateStr}.zip"`);
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.send(zipBuffer);

    // Update last_backup_at (non-critical)
    try {
      await db.execute(sql`
        INSERT INTO company_settings (company_id, last_backup_at)
        VALUES (${cid}, NOW())
        ON DUPLICATE KEY UPDATE last_backup_at = NOW()
      `);
    } catch { /* non-critical */ }

  } catch (error) {
    console.error('GET /api/settings/backup/export error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Export failed' });
  }
}
