/**
 * POST /api/settings/xero-credentials
 * Save or clear the company's Xero OAuth credentials.
 * Owner only.
 *
 * Body: { clientId, clientSecret, redirectUri } to save
 *       { clear: true } to remove
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
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
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });
    if (profile.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

    const body = req.body as { clientId?: string; clientSecret?: string; redirectUri?: string; clear?: boolean };

    if (body.clear) {
      // Clear company credentials — will fall back to platform secrets
      await db.execute(sql`
        INSERT INTO company_settings (company_id, xero_client_id, xero_client_secret, xero_redirect_uri)
        VALUES (${profile.companyId}, NULL, NULL, NULL)
        ON DUPLICATE KEY UPDATE
          xero_client_id     = NULL,
          xero_client_secret = NULL,
          xero_redirect_uri  = NULL
      `);
      console.log(`[xero-credentials] Company ${profile.companyId} credentials cleared`);
      return res.json({ ok: true, configured: false });
    }

    const clientId    = (body.clientId    ?? '').trim();
    const clientSecret = (body.clientSecret ?? '').trim();
    const redirectUri  = (body.redirectUri  ?? '').trim();

    if (!clientId || !clientSecret || !redirectUri) {
      return res.status(400).json({ error: 'Client ID, Client Secret and Redirect URI are all required.' });
    }

    await db.execute(sql`
      INSERT INTO company_settings (company_id, xero_client_id, xero_client_secret, xero_redirect_uri)
      VALUES (${profile.companyId}, ${clientId}, ${clientSecret}, ${redirectUri})
      ON DUPLICATE KEY UPDATE
        xero_client_id     = ${clientId},
        xero_client_secret = ${clientSecret},
        xero_redirect_uri  = ${redirectUri}
    `);

    console.log(`[xero-credentials] Company ${profile.companyId} credentials saved`);
    res.json({
      ok: true,
      configured: true,
      source: 'company',
      maskedClientId: `${clientId.slice(0, 4)}...${clientId.slice(-4)}`,
      redirectUri,
    });
  } catch (error) {
    console.error('POST /api/settings/xero-credentials error:', error);
    res.status(500).json({ error: 'Failed to save credentials' });
  }
}
