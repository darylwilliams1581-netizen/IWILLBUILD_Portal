/**
 * DELETE /api/fleet/asset-bookings/:id
 * Remove an asset booking.
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

    const [result] = await db.execute(
      sql`DELETE FROM asset_bookings WHERE id = ${bookingId} AND company_id = ${profile.companyId}`
    ) as unknown as [{ affectedRows: number }, unknown];

    if ((result as { affectedRows: number }).affectedRows === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/fleet/asset-bookings/:id error:', error);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
}
