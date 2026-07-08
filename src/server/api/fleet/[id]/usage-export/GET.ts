/**
 * GET /api/fleet/:id/usage-export
 *
 * Downloads a CSV of all usage sessions for a fleet asset.
 * Query params: dateFrom, dateTo (YYYY-MM-DD, optional)
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

interface UsageRow {
  id: number;
  user_name: string | null;
  user_email: string | null;
  actor_type: string | null;
  job_name: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  meter_start: number | null;
  meter_end: number | null;
  note: string | null;
  source: string | null;
}

function esc(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const fleetId   = parseInt(req.params.id);
  const companyId = auth.profile.companyId;

  if (!fleetId) return res.status(400).json({ error: 'Invalid fleet id' });

  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo   = req.query.dateTo   as string | undefined;

  try {
    // Verify asset belongs to company
    const [assetRows] = await db.execute(
      sql`SELECT id, name FROM fleet_assets
          WHERE id = ${fleetId} AND company_id = ${companyId} AND archived = 0 LIMIT 1`
    ) as unknown as [Array<{ id: number; name: string }>, unknown];

    if (!assetRows.length) return res.status(404).json({ error: 'Asset not found' });
    const assetName = assetRows[0].name;

    const clauses: string[] = [
      `ful.company_id = ${companyId}`,
      `ful.fleet_id = ${fleetId}`,
    ];
    if (dateFrom) clauses.push(`DATE(ful.started_at) >= '${dateFrom.replace(/'/g, '')}'`);
    if (dateTo)   clauses.push(`DATE(ful.started_at) <= '${dateTo.replace(/'/g, '')}'`);

    const [rows] = await db.execute(sql.raw(`
      SELECT
        ful.id,
        u.name                AS user_name,
        u.email               AS user_email,
        ful.actor_type,
        j.name                AS job_name,
        ful.started_at,
        ful.ended_at,
        ful.duration_minutes,
        ful.meter_start,
        ful.meter_end,
        ful.note,
        ful.source
      FROM fleet_usage_logs ful
      LEFT JOIN users u ON u.id = ful.user_id
      LEFT JOIN jobs j  ON j.id = ful.job_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY ful.started_at DESC
    `)) as unknown as [UsageRow[], unknown];

    const headers = [
      'ID', 'User Name', 'User Email', 'Actor Type',
      'Job', 'Started At', 'Ended At', 'Duration (min)',
      'Meter Start', 'Meter End', 'Note', 'Source',
    ];

    const lines = [headers.join(',')];
    for (const r of rows ?? []) {
      lines.push([
        esc(r.id),
        esc(r.user_name),
        esc(r.user_email),
        esc(r.actor_type),
        esc(r.job_name),
        esc(r.started_at),
        esc(r.ended_at),
        esc(r.duration_minutes),
        esc(r.meter_start),
        esc(r.meter_end),
        esc(r.note),
        esc(r.source),
      ].join(','));
    }

    const csv = lines.join('\r\n');
    const safeName = assetName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const filename = `fleet-usage-${safeName}-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err) {
    console.error('GET /api/fleet/:id/usage-export error:', err);
    return res.status(500).json({ error: 'Failed to export usage data' });
  }
}
