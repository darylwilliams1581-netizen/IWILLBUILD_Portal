/**
 * GET /api/integrations/xero/status
 * Returns the Xero connection status for the current company.
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
    if (!profile?.companyId) return res.json({ connected: false });

    const [rows] = await db.execute(
      sql`SELECT id, tenant_name, connected_at, expires_at FROM xero_connections WHERE company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number; tenant_name: string; connected_at: string; expires_at: string }>, unknown];

    const conn = rows?.[0];
    if (!conn) return res.json({ connected: false });

    res.json({
      connected: true,
      tenantName: conn.tenant_name,
      connectedAt: conn.connected_at,
      expiresAt: conn.expires_at,
    });
  } catch (err) {
    console.error('GET /api/integrations/xero/status error:', err);
    res.status(500).json({ error: 'Failed to check Xero status' });
  }
}
