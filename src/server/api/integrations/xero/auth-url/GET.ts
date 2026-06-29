/**
 * GET /api/integrations/xero/auth-url
 * Returns the Xero OAuth2 authorisation URL for the company to connect.
 * Requires admin/owner.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
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
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const isAdmin = profile.role === 'owner' || profile.role === 'admin' || profile.permAdmin === true;
    if (!isAdmin) return res.status(403).json({ error: 'Admin only' });

    const creds = await getXeroCredentials(profile.companyId);
    if (!creds) {
      return res.status(500).json({ error: 'Xero credentials not configured. Set them up in Settings → Accounting.' });
    }

    // State = base64(companyId:randomNonce) — verified in callback
    const nonce = crypto.randomBytes(16).toString('hex');
    const state = Buffer.from(`${profile.companyId}:${nonce}`).toString('base64url');

    const scopes = [
      'openid', 'profile', 'email',
      'offline_access',
      'accounting.contacts',
      'accounting.contacts.read',
      'accounting.invoices',
      'accounting.invoices.read',
      'accounting.settings.read',
      'accounting.attachments',
      'accounting.attachments.read',
    ].join(' ');

    const url = new URL('https://login.xero.com/identity/connect/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', creds.clientId);
    url.searchParams.set('redirect_uri', creds.redirectUri);
    url.searchParams.set('scope', scopes);
    url.searchParams.set('state', state);

    res.json({ url: url.toString(), state });
  } catch (err) {
    console.error('GET /api/integrations/xero/auth-url error:', err);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
}
