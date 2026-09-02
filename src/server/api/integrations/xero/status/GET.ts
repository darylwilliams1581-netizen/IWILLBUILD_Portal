/**
 * GET /api/integrations/xero/status
 * Returns the Xero connection status for the current company.
 * Also returns platformReady: true/false so the UI knows whether the
 * IWIllBUILD owner has configured the Xero Developer App credentials.
 * Customers never need to touch those credentials — they just click Connect.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getXeroCredentials } from '../../../../lib/xero-credentials.js';

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

    // Check whether Xero credentials are configured (company or platform)
    const creds = await getXeroCredentials(profile?.companyId ?? null);
    const platformReady = creds !== null;

    if (!profile?.companyId) return res.json({ connected: false, platformReady });

    const [rows] = await db.execute(
      sql`SELECT id, tenant_name, connected_at, expires_at FROM xero_connections WHERE company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number; tenant_name: string; connected_at: string; expires_at: string }>, unknown];

    const conn = rows?.[0];
    if (!conn) return res.json({ connected: false, platformReady });

    res.json({
      connected: true,
      platformReady,
      tenantName: conn.tenant_name,
      connectedAt: conn.connected_at,
      expiresAt: conn.expires_at,
    });
  } catch (err) {
    console.error('GET /api/integrations/xero/status error:', err);
    res.status(500).json({ error: 'Failed to check Xero status' });
  }
}
