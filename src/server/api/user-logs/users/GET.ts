/**
 * GET /api/user-logs/users
 * Returns all team members for the company — used to populate the user picker.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const companyId = auth.profile.companyId;

  try {
    const [rows] = await db.execute(sql.raw(`
      SELECT
        u.id        AS user_id,
        u.name,
        u.email,
        p.role,
        p.status
      FROM profiles p
      JOIN \`user\` u ON u.id = p.user_id
      WHERE p.company_id = ${companyId}
        AND p.status != 'archived'
      ORDER BY u.name ASC
    `)) as unknown as [Array<{ user_id: string; name: string; email: string; role: string; status: string }>, unknown];

    return res.json({ users: rows ?? [] });
  } catch (err) {
    console.error('GET /api/user-logs/users error:', err);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
}
