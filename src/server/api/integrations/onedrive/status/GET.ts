/**
 * GET /api/integrations/onedrive/status
 * Returns the current OneDrive connection status for the company.
 */
import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';
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

    // Check if Azure secrets are configured
    const clientId = getSecret('AZURE_CLIENT_ID');
    const configured = !!clientId;

    // Check for existing connection
    const [rows] = await db.execute(
      sql`SELECT id, display_name, connected_at, expires_at FROM onedrive_connections WHERE company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number; display_name: string; connected_at: string; expires_at: string }>, unknown];

    const connection = rows?.[0] ?? null;

    res.json({
      configured,
      connected: !!connection,
      displayName: connection?.display_name ?? null,
      connectedAt: connection?.connected_at ?? null,
      expiresAt: connection?.expires_at ?? null,
    });
  } catch (err) {
    console.error('GET /api/integrations/onedrive/status error:', err);
    res.status(500).json({ error: 'Failed to fetch OneDrive status' });
  }
}
