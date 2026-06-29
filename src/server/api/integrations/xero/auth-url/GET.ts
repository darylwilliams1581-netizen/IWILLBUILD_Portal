/**
 * GET /api/integrations/xero/auth-url
 * Returns the Xero OAuth2 authorisation URL for the company to connect.
 * Requires admin/owner.
 */
import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

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

    const clientId = getSecret('XERO_CLIENT_ID');
    const redirectUri = getSecret('XERO_REDIRECT_URI');
    if (!clientId || !redirectUri) {
      return res.status(500).json({ error: 'Xero credentials not configured. Add XERO_CLIENT_ID and XERO_REDIRECT_URI in Settings → Secrets.' });
    }

    // State = base64(companyId:randomNonce) — verified in callback
    const nonce = crypto.randomBytes(16).toString('hex');
    const state = Buffer.from(`${profile.companyId}:${nonce}`).toString('base64url');

    const scopes = [
      'openid', 'profile', 'email',
      'accounting.transactions',
      'accounting.contacts',
      'accounting.settings',
      'offline_access',
    ].join(' ');

    const url = new URL('https://login.xero.com/identity/connect/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', scopes);
    url.searchParams.set('state', state);

    res.json({ url: url.toString(), state });
  } catch (err) {
    console.error('GET /api/integrations/xero/auth-url error:', err);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
}
