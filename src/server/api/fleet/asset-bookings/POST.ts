/**
 * POST /api/fleet/asset-bookings
 * Create a new asset booking.
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

    const { fleet_asset_id, job_id, title, start_date, end_date, start_time, end_time, notes, status } = req.body as Record<string, unknown>;

    if (!fleet_asset_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'fleet_asset_id, start_date and end_date are required' });
    }

    // Verify the asset belongs to this company
    const [assetRows] = await db.execute(
      sql`SELECT id FROM fleet_assets WHERE id = ${fleet_asset_id} AND company_id = ${profile.companyId} AND archived = 0 LIMIT 1`
    ) as unknown as [Array<{ id: number }>, unknown];
    if (!assetRows?.length) return res.status(404).json({ error: 'Asset not found' });

    const [result] = await db.execute(
      sql`INSERT INTO asset_bookings
            (company_id, fleet_asset_id, job_id, title, start_date, end_date, start_time, end_time, notes, status, created_by_user_id)
          VALUES
            (${profile.companyId}, ${fleet_asset_id}, ${job_id ?? null}, ${title ?? ''}, ${start_date}, ${end_date},
             ${start_time ?? null}, ${end_time ?? null}, ${notes ?? null}, ${status ?? 'booked'}, ${session.user.id})`
    ) as unknown as [{ insertId: number }, unknown];

    const insertId = (result as { insertId: number }).insertId;

    // Return the full booking with asset/job info
    const [rows] = await db.execute(
      sql`SELECT ab.*, fa.name AS asset_name, fa.type AS asset_type, fa.rego AS asset_rego,
                 j.name AS job_name, j.job_number AS job_number, j.client AS job_client
          FROM asset_bookings ab
          JOIN fleet_assets fa ON fa.id = ab.fleet_asset_id
          LEFT JOIN jobs j ON j.id = ab.job_id
          WHERE ab.id = ${insertId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ booking: rows?.[0] ?? null });
  } catch (error) {
    console.error('POST /api/fleet/asset-bookings error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
}
