/**
 * GET /api/finance/timesheets/employees
 * Returns all active profiles in the caller's company for the employee picker.
 * Any authenticated company member may call this.
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
      WHERE p.company_id = ${profile.companyId}
        AND p.status = 'active'
      ORDER BY u.name ASC
    `);

    const employees = (rows as Array<{ profile_id: number; name: string; email: string }>).map(r => ({
      profileId: r.profile_id,
      name: r.name ?? 'Unknown',
      email: r.email ?? '',
    }));

    return res.json({ employees });
  } catch (err) {
    console.error('[GET /api/finance/timesheets/employees]', err);
    return res.status(500).json({ error: 'Failed to load employees' });
  }
}
