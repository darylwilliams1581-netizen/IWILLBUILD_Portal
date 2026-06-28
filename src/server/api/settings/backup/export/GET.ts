/**
 * GET /api/settings/backup/export
 * ─────────────────────────────────────────────────────────────────────────────
 * Downloads a full company data backup as a ZIP containing JSON + CSV manifests.
 * Auth required. Owner/Admin only.
 *
 * ZIP contents:
 *   company-summary.json
 *   jobs.json
 *   estimates.json
 *   job-costs.json
 *   forms.json
 *   fleet.json
 *   users.json
 *   settings.json
 *   files-manifest.csv
 *   photos-manifest.csv
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import JSZip from 'jszip';

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
    if (!['owner', 'admin'].includes(profile.role ?? '')) {
      return res.status(403).json({ error: 'Owner or Admin access required' });
    }

    const companyId = profile.companyId;

    const safeQuery = async <T>(q: ReturnType<typeof sql>): Promise<T[]> => {
      try {
        const [rows] = await db.execute(q) as unknown as [T[], unknown];
        return rows ?? [];
      } catch {
        return [];
      }
    };

    // ── Gather all data ───────────────────────────────────────────────────────

    const [
      companyRows,
      jobRows,
      estimateRows,
      estimateLineRows,
      jobCostRows,
      formRows,
      formSubmissionRows,
      fleetRows,
      userRows,
      fileRows,
      photoRows,
      settingsRows,
    ] = await Promise.all([
      safeQuery(sql`SELECT * FROM companies WHERE id = ${companyId} LIMIT 1`),
      safeQuery(sql`SELECT * FROM jobs WHERE company_id = ${companyId} ORDER BY id`),
      safeQuery(sql`SELECT * FROM estimates WHERE company_id = ${companyId} ORDER BY id`),
      safeQuery(sql`SELECT * FROM estimate_lines WHERE company_id = ${companyId} ORDER BY estimate_id, line_order`),
      safeQuery(sql`SELECT * FROM job_costs WHERE company_id = ${companyId} ORDER BY job_id, id`),
      safeQuery(sql`SELECT * FROM form_templates WHERE company_id = ${companyId} ORDER BY id`),
      safeQuery(sql`SELECT id, job_id, template_id, completed_by_name, status, created_at, updated_at FROM job_form_submissions WHERE company_id = ${companyId} ORDER BY id`),
      safeQuery(sql`SELECT * FROM fleet_assets WHERE company_id = ${companyId} ORDER BY id`),
      safeQuery(sql`SELECT p.id, p.role, p.status, p.created_at, u.name, u.email FROM profiles p JOIN \`user\` u ON u.id = p.user_id WHERE p.company_id = ${companyId}`),
      safeQuery(sql`SELECT id, job_id, fleet_asset_id, original_name, stored_name, mime_type, size_bytes, file_category, label, created_at FROM company_files WHERE company_id = ${companyId} ORDER BY id`),
      safeQuery(sql`SELECT id, job_id, filename, original_name, label, mime_type, size_bytes, uploaded_by_name, created_at FROM job_photos WHERE company_id = ${companyId} ORDER BY job_id, id`),
      safeQuery(sql`SELECT structure_json, dazza_json, banner_json, pdf_json, backup_json FROM company_settings WHERE company_id = ${companyId} LIMIT 1`),
    ]);

    // ── Build CSV helpers ─────────────────────────────────────────────────────

    function toCsv(rows: Record<string, unknown>[], cols: string[]): string {
      const escape = (v: unknown) => {
        const s = v == null ? '' : String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };
      const header = cols.join(',');
      const body = rows.map(r => cols.map(c => escape(r[c])).join(',')).join('\n');
      return `${header}\n${body}`;
    }

    const filesCsv = toCsv(fileRows as Record<string, unknown>[], [
      'id', 'job_id', 'fleet_asset_id', 'original_name', 'stored_name',
      'mime_type', 'size_bytes', 'file_category', 'label', 'created_at',
    ]);

    const photosCsv = toCsv(photoRows as Record<string, unknown>[], [
      'id', 'job_id', 'filename', 'original_name', 'label',
      'mime_type', 'size_bytes', 'uploaded_by_name', 'created_at',
    ]);

    const exportedAt = new Date().toISOString();
    const companySummary = {
      exportedAt,
      company: companyRows[0] ?? {},
      counts: {
        jobs: jobRows.length,
        estimates: estimateRows.length,
        fleet: fleetRows.length,
        users: userRows.length,
        files: fileRows.length,
        photos: photoRows.length,
        formTemplates: formRows.length,
        formSubmissions: formSubmissionRows.length,
      },
    };

    // ── Build ZIP with JSZip ──────────────────────────────────────────────────

    const zip = new JSZip();
    zip.file('company-summary.json', JSON.stringify(companySummary, null, 2));
    zip.file('jobs.json', JSON.stringify(jobRows, null, 2));
    zip.file('estimates.json', JSON.stringify({ estimates: estimateRows, lines: estimateLineRows }, null, 2));
    zip.file('job-costs.json', JSON.stringify(jobCostRows, null, 2));
    zip.file('forms.json', JSON.stringify({ templates: formRows, submissions: formSubmissionRows }, null, 2));
    zip.file('fleet.json', JSON.stringify(fleetRows, null, 2));
    zip.file('users.json', JSON.stringify(userRows, null, 2));
    zip.file('settings.json', JSON.stringify(settingsRows[0] ?? {}, null, 2));
    zip.file('files-manifest.csv', filesCsv);
    zip.file('photos-manifest.csv', photosCsv);

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="iwillbuild-backup-${dateStr}.zip"`);
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.send(zipBuffer);

    // Update last_backup_at
    try {
      await db.execute(sql`
        INSERT INTO company_settings (company_id, last_backup_at)
        VALUES (${companyId}, NOW())
        ON DUPLICATE KEY UPDATE last_backup_at = NOW()
      `);
    } catch { /* non-critical */ }

  } catch (error) {
    console.error('GET /api/settings/backup/export error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Export failed' });
    }
  }
}
