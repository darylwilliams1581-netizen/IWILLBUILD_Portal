/**
 * GET /api/team/invites
 * Company owner/admin — list all invites for the company with status.
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
    if (!profile?.companyId) return res.status(403).json({ error: 'No company.' });
    if (profile.role !== 'owner' && profile.role !== 'admin' && !profile.permAdmin) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    type InviteRow = {
      id: number;
      email: string;
      name: string | null;
      role: string;
      status: string;
      invited_by_email: string;
      expires_at: string;
      accepted_at: string | null;
      cancelled_at: string | null;
      created_at: string;
    };

    const [rows] = await db.execute(
      sql`SELECT id, email, name, role, status, invited_by_email, expires_at, accepted_at, cancelled_at, created_at
          FROM company_invites
          WHERE company_id = ${profile.companyId}
          ORDER BY created_at DESC
          LIMIT 200`
    ) as unknown as [InviteRow[], unknown];

    const now = new Date();
    const invites = (rows ?? []).map(inv => ({
      ...inv,
      status: inv.status === 'pending' && new Date(inv.expires_at) < now ? 'expired' : inv.status,
    }));

    return res.json({ invites });
  } catch (err) {
    console.error('GET /api/team/invites error:', err);
    return res.status(500).json({ error: 'Failed to fetch invites.' });
  }
}
