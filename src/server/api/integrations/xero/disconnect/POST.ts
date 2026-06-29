/**
 * POST /api/integrations/xero/disconnect
 * Revokes the Xero connection for the current company.
 * Requires admin/owner.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

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

    const isAdmin = profile.role === 'owner' || profile.role === 'admin' || profile.permAdmin === true;
    if (!isAdmin) return res.status(403).json({ error: 'Admin only' });

    await db.execute(sql`DELETE FROM xero_connections WHERE company_id = ${profile.companyId}`);

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/integrations/xero/disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect Xero' });
  }
}
