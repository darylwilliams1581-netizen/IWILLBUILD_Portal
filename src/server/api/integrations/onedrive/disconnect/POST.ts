/**
 * POST /api/integrations/onedrive/disconnect
 * Removes the OneDrive connection for the company.
 * Does NOT revoke the token at Microsoft — user can do that from their
 * Microsoft account settings if needed.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
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
    if (!['owner', 'admin'].includes(profile.role)) return res.status(403).json({ error: 'Admin only' });

    await db.execute(
      sql`DELETE FROM onedrive_connections WHERE company_id = ${profile.companyId}`
    );

    console.log(`[onedrive] Company ${profile.companyId} disconnected OneDrive`);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/integrations/onedrive/disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect OneDrive' });
  }
}
