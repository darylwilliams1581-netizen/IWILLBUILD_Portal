/**
 * GET /api/settings/backup/csv-pack
 * ─────────────────────────────────────────────────────────────────────────────
 * Exports all major records as CSV files in a single ZIP.
 * Auth required. Owner/Admin only.
 *
 * ZIP contents:
 *   jobs.csv
 *   tasks.csv
 *   notes.csv
 *   attendance.csv
 *   delays.csv
 *   costs.csv
 *   estimates.csv
 *   fleet.csv
 *   users.csv
 *   incidents.csv
 *   risk-register.csv
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
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
    if (!['owner', 'admin'].includes(profile.role ?? '')) {
      return res.status(403).json({ error: 'Owner or Admin access required' });
    }

    const cid = profile.companyId;

    const safeQuery = async <T>(q: ReturnType<typeof sql>): Promise<T[]> => {
      try {
        const [rows] = await db.execute(q) as unknown as [T[], unknown];
        return rows ?? [];
      } catch { return []; }
    };

    const [
      jobs, tasks, notes, attendance, delays, costs,
      estimates, fleet, users, incidents, risks,
    ] = await Promise.all([
      safeQuery(sql`SELECT id, job_number, name, status, client_name, site_address, start_date, end_date, created_at FROM jobs WHERE company_id = ${cid} ORDER BY id`),
      safeQuery(sql`SELECT id, job_id, title, status, assigned_to_name, due_date, created_at FROM job_tasks WHERE company_id = ${cid} ORDER BY job_id, id`),
      safeQuery(sql`SELECT id, job_id, content, created_by_name, created_at FROM job_notes WHERE company_id = ${cid} ORDER BY job_id, id`),
      safeQuery(sql`SELECT id, job_id, user_name, sign_in_at, sign_out_at, role FROM job_attendance WHERE company_id = ${cid} ORDER BY job_id, sign_in_at`),
      safeQuery(sql`SELECT id, job_id, reason, delay_date, duration_hours, created_by_name, created_at FROM job_delays WHERE company_id = ${cid} ORDER BY job_id, delay_date`),
      safeQuery(sql`SELECT id, job_id, description, category, amount, supplier, cost_date, created_at FROM job_costs WHERE company_id = ${cid} ORDER BY job_id, id`),
      safeQuery(sql`SELECT id, job_id, title, status, total_amount, created_at FROM estimates WHERE company_id = ${cid} ORDER BY id`),
      safeQuery(sql`SELECT id, asset_number, name, category, status, make, model, year, created_at FROM fleet_assets WHERE company_id = ${cid} ORDER BY id`),
      safeQuery(sql`SELECT p.id, u.name, u.email, p.role, p.status, p.created_at FROM profiles p JOIN \`user\` u ON u.id = p.user_id WHERE p.company_id = ${cid}`),
      safeQuery(sql`SELECT id, incident_date, severity, status, description, reported_by, location, created_at FROM incidents WHERE company_id = ${cid} ORDER BY incident_date DESC`),
      safeQuery(sql`SELECT id, title, category, likelihood, consequence, risk_level, status, responsible_person, due_date, identified_date FROM risk_register WHERE company_id = ${cid} ORDER BY id`),
    ]);

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const files: [string, Record<string, unknown>[]][] = [
      ['jobs.csv', jobs as Record<string, unknown>[]],
      ['tasks.csv', tasks as Record<string, unknown>[]],
      ['notes.csv', notes as Record<string, unknown>[]],
      ['attendance.csv', attendance as Record<string, unknown>[]],
      ['delays.csv', delays as Record<string, unknown>[]],
      ['costs.csv', costs as Record<string, unknown>[]],
      ['estimates.csv', estimates as Record<string, unknown>[]],
      ['fleet.csv', fleet as Record<string, unknown>[]],
      ['users.csv', users as Record<string, unknown>[]],
      ['incidents.csv', incidents as Record<string, unknown>[]],
      ['risk-register.csv', risks as Record<string, unknown>[]],
    ];
    for (const [name, rows] of files) {
      zip.file(name, toCsv(rows));
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="iwillbuild-csv-pack-${dateStr}.zip"`);
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.send(zipBuffer);
  } catch (error) {
    console.error('GET /api/settings/backup/csv-pack error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Export failed' });
  }
}
