/**
 * GET /api/integrations/qbo/auth-url
 * Returns the Intuit OAuth 2.0 authorization URL.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getQboCredentials } from '../../../../lib/qbo-client.js';

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
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const creds = await getQboCredentials(profile.companyId);
    if (!creds) {
      return res.status(400).json({
        error: 'QBO credentials not configured. Add QBO_CLIENT_ID, QBO_CLIENT_SECRET, and QBO_REDIRECT_URI in Settings → Secrets.',
        platformReady: false,
      });
    }

    const state = Buffer.from(JSON.stringify({ companyId: profile.companyId, ts: Date.now() })).toString('base64url');
    const params = new URLSearchParams({
      client_id: creds.clientId,
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      redirect_uri: creds.redirectUri,
      state,
    });

    res.json({
      url: `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`,
      platformReady: true,
    });
  } catch (err) {
    console.error('GET /api/integrations/qbo/auth-url error:', err);
    res.status(500).json({ error: 'Failed to generate QBO auth URL' });
  }
}
