/**
 * GET /api/fleet/asset-bookings
 * Returns asset bookings for the company, optionally filtered by date range.
 * Query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

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

    const { startDate, endDate } = req.query as Record<string, string>;

    // Build date filter — bookings that overlap the requested window
    let dateFilter = sql``;
    if (startDate && endDate) {
      dateFilter = sql` AND ab.end_date >= ${startDate} AND ab.start_date <= ${endDate}`;
    } else if (startDate) {
      dateFilter = sql` AND ab.end_date >= ${startDate}`;
    }

    const [rows] = await db.execute(
      sql`SELECT
            ab.id,
            ab.fleet_asset_id,
            ab.job_id,
            ab.title,
            ab.start_date,
            ab.end_date,
            ab.start_time,
            ab.end_time,
            ab.notes,
            ab.status,
            ab.created_at,
            fa.name   AS asset_name,
            fa.type   AS asset_type,
            fa.rego   AS asset_rego,
            fa.make_model AS asset_make_model,
            j.name    AS job_name,
            j.job_number AS job_number,
            j.client  AS job_client
          FROM asset_bookings ab
          JOIN fleet_assets fa ON fa.id = ab.fleet_asset_id
          LEFT JOIN jobs j ON j.id = ab.job_id
          WHERE ab.company_id = ${profile.companyId}
            AND fa.archived = 0
            ${dateFilter}
          ORDER BY ab.start_date ASC, fa.name ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    // Also return all active fleet assets so the UI can show unbooked rows
    const [assets] = await db.execute(
      sql`SELECT id, name, type, make_model, rego, status
          FROM fleet_assets
          WHERE company_id = ${profile.companyId}
            AND archived = 0
          ORDER BY name ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ bookings: rows ?? [], assets: assets ?? [] });
  } catch (error) {
    console.error('GET /api/fleet/asset-bookings error:', error);
    res.status(500).json({ error: 'Failed to load asset bookings' });
  }
}
