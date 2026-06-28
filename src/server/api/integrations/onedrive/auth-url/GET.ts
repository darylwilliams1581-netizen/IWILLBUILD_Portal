/**
 * GET /api/integrations/onedrive/auth-url
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns the Microsoft OAuth2 authorization URL.
 * The client redirects the user to this URL to begin the consent flow.
 *
 * Required secrets:
 *   AZURE_CLIENT_ID      — App registration client ID
 *   AZURE_TENANT_ID      — Tenant ID (or 'common' for multi-tenant)
 *   AZURE_REDIRECT_URI   — Must match the redirect URI registered in Azure
 */
import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import crypto from 'node:crypto';

const SCOPES = [
  'offline_access',
  'Files.ReadWrite',
  'Sites.ReadWrite.All',
  'User.Read',
].join(' ');

export default async function handler(req: Request, res: Response) {
  try {
    const clientId    = getSecret('AZURE_CLIENT_ID');
    const tenantId    = getSecret('AZURE_TENANT_ID') ?? 'common';
    const redirectUri = getSecret('AZURE_REDIRECT_URI');

    if (!clientId || !redirectUri) {
      return res.status(503).json({
        error: 'OneDrive integration is not configured. Add AZURE_CLIENT_ID and AZURE_REDIRECT_URI in Settings → Secrets.',
        notConfigured: true,
      });
    }

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

    // State encodes companyId + a random nonce to prevent CSRF
    const nonce = crypto.randomBytes(16).toString('hex');
    const state = Buffer.from(JSON.stringify({ companyId: profile.companyId, nonce })).toString('base64url');

    const params = new URLSearchParams({
      client_id:     clientId,
      response_type: 'code',
      redirect_uri:  redirectUri,
      scope:         SCOPES,
      response_mode: 'query',
      state,
    });

    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
    res.json({ url });
  } catch (err) {
    console.error('GET /api/integrations/onedrive/auth-url error:', err);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
}
