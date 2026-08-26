/**
 * GET /api/finance/timesheets/me
 * Returns the authenticated user's profile info for the timesheet UI.
 * Used to display the employee name without exposing other employees' data.
 */
import type { Request, Response } from 'express';
import { resolvePOProfile } from '@/server/lib/po-auth.js';
import { db } from '@/server/db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const profile = await resolvePOProfile(req, res);
  if (!profile) return;

  try {
    const [rows] = await db.execute(sql`
      SELECT p.id AS profile_id, u.name, u.email
      FROM profiles p
      INNER JOIN user u ON u.id = p.user_id
      WHERE p.id = ${profile.id}
      LIMIT 1
    `);

    const row = (rows as Array<{ profile_id: number; name: string; email: string }>)[0];
    if (!row) return res.status(404).json({ error: 'Profile not found' });

    return res.json({
      profileId: row.profile_id,
      name: row.name ?? 'Unknown',
      email: row.email ?? '',
      isAdmin: profile.isAdmin,
    });
  } catch (err) {
    console.error('[GET /api/finance/timesheets/me]', err);
    return res.status(500).json({ error: 'Failed to load profile' });
  }
}
