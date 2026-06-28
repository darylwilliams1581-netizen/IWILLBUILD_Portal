/**
 * GET /api/integrations/onedrive/callback
 * ─────────────────────────────────────────────────────────────────────────────
 * Azure OAuth2 redirect URI handler.
 * Exchanges the authorization code for access + refresh tokens,
 * fetches the user's OneDrive display name, and stores the connection.
 *
 * On success: redirects to /settings?tab=integrations&onedrive=connected
 * On error:   redirects to /settings?tab=integrations&onedrive=error&msg=...
 */
import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const { code, state, error: oauthError, error_description } = req.query as Record<string, string>;

  const failRedirect = (msg: string) =>
    res.redirect(`/settings?tab=integrations&onedrive=error&msg=${encodeURIComponent(msg)}`);

  if (oauthError) {
    return failRedirect(error_description ?? oauthError);
  }

  if (!code || !state) {
    return failRedirect('Missing code or state from Microsoft');
  }

  // Decode state
  let companyId: number;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    companyId = Number(decoded.companyId);
    if (!companyId) throw new Error('bad companyId');
  } catch {
    return failRedirect('Invalid state parameter');
  }

  const clientId     = getSecret('AZURE_CLIENT_ID');
  const clientSecret = getSecret('AZURE_CLIENT_SECRET');
  const tenantId     = getSecret('AZURE_TENANT_ID') ?? 'common';
  const redirectUri  = getSecret('AZURE_REDIRECT_URI');

  if (!clientId || !clientSecret || !redirectUri) {
    return failRedirect('OneDrive integration secrets are not fully configured');
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     clientId,
          client_secret: clientSecret,
          code,
          redirect_uri:  redirectUri,
          grant_type:    'authorization_code',
        }).toString(),
      }
    );

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error('[onedrive-callback] token exchange failed:', body);
      return failRedirect('Token exchange failed — check Azure app credentials');
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
    };

    // Fetch user profile from Microsoft Graph
    const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const me = meRes.ok ? await meRes.json() as { displayName?: string; mail?: string; userPrincipalName?: string } : {};

    const displayName = me.displayName ?? me.mail ?? me.userPrincipalName ?? 'OneDrive User';
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Upsert into onedrive_connections
    await db.execute(sql.raw(`
      INSERT INTO onedrive_connections
        (company_id, display_name, access_token, refresh_token, expires_at, connected_at, updated_at)
      VALUES
        (${companyId}, ${JSON.stringify(displayName)}, ${JSON.stringify(tokens.access_token)},
         ${JSON.stringify(tokens.refresh_token)}, ${JSON.stringify(expiresAt.toISOString().slice(0, 19).replace('T', ' '))},
         NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        display_name   = VALUES(display_name),
        access_token   = VALUES(access_token),
        refresh_token  = VALUES(refresh_token),
        expires_at     = VALUES(expires_at),
        updated_at     = NOW()
    `));

    console.log(`[onedrive] Company ${companyId} connected OneDrive as "${displayName}"`);
    res.redirect('/settings?tab=integrations&onedrive=connected');
  } catch (err) {
    console.error('[onedrive-callback] error:', err);
    return failRedirect('Unexpected error during OneDrive connection');
  }
}
