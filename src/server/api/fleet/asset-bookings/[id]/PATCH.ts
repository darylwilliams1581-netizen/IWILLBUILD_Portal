/**
 * PATCH /api/fleet/asset-bookings/:id
 * Update an existing asset booking (dates, title, job, notes, status).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

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

    const bookingId = parseInt(req.params.id, 10);
    if (isNaN(bookingId)) return res.status(400).json({ error: 'Invalid booking id' });

    // Verify ownership
    const [existing] = await db.execute(
      sql`SELECT id FROM asset_bookings WHERE id = ${bookingId} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number }>, unknown];
    if (!existing?.length) return res.status(404).json({ error: 'Booking not found' });

    const { job_id, title, start_date, end_date, start_time, end_time, notes, status } = req.body as Record<string, unknown>;

    await db.execute(
      sql`UPDATE asset_bookings SET
            job_id     = COALESCE(${job_id !== undefined ? job_id : null}, job_id),
            title      = COALESCE(${title ?? null}, title),
            start_date = COALESCE(${start_date ?? null}, start_date),
            end_date   = COALESCE(${end_date ?? null}, end_date),
            start_time = ${start_time !== undefined ? start_time : sql`start_time`},
            end_time   = ${end_time !== undefined ? end_time : sql`end_time`},
            notes      = ${notes !== undefined ? notes : sql`notes`},
            status     = COALESCE(${status ?? null}, status),
            updated_at = NOW()
          WHERE id = ${bookingId} AND company_id = ${profile.companyId}`
    );

    const [rows] = await db.execute(
      sql`SELECT ab.*, fa.name AS asset_name, fa.type AS asset_type, fa.rego AS asset_rego,
                 j.name AS job_name, j.job_number AS job_number, j.client AS job_client
          FROM asset_bookings ab
          JOIN fleet_assets fa ON fa.id = ab.fleet_asset_id
          LEFT JOIN jobs j ON j.id = ab.job_id
          WHERE ab.id = ${bookingId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ booking: rows?.[0] ?? null });
  } catch (error) {
    console.error('PATCH /api/fleet/asset-bookings/:id error:', error);
    res.status(500).json({ error: 'Failed to update booking' });
  }
}
