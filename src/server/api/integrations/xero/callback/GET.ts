/**
 * GET /api/integrations/xero/callback
 * Handles the OAuth2 redirect from Xero. Exchanges code for tokens,
 * fetches the tenant list, and stores the connection.
 * Redirects to /settings?tab=accounting&xero=connected on success.
 */
import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';

interface XeroTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface XeroTenant {
  tenantId: string;
  tenantName: string;
  tenantType: string;
}

export default async function handler(req: Request, res: Response) {
  const { code, state, error: oauthError } = req.query as Record<string, string>;

  if (oauthError) {
    console.error('[xero-callback] OAuth error:', oauthError);
    return res.redirect('/settings?tab=accounting&xero=error&reason=' + encodeURIComponent(oauthError));
  }

  if (!code || !state) {
    return res.redirect('/settings?tab=accounting&xero=error&reason=missing_params');
  }

  try {
    // Decode state to get companyId
    let companyId: number;
    try {
      const decoded = Buffer.from(state, 'base64url').toString('utf8');
      const parts = decoded.split(':');
      companyId = parseInt(parts[0], 10);
      if (!companyId || isNaN(companyId)) throw new Error('bad state');
    } catch {
      return res.redirect('/settings?tab=accounting&xero=error&reason=invalid_state');
    }

    const clientId = getSecret('XERO_CLIENT_ID');
    const clientSecret = getSecret('XERO_CLIENT_SECRET');
    const redirectUri = getSecret('XERO_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      return res.redirect('/settings?tab=accounting&xero=error&reason=missing_credentials');
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[xero-callback] Token exchange failed:', errText);
      return res.redirect('/settings?tab=accounting&xero=error&reason=token_exchange_failed');
    }

    const tokens = await tokenRes.json() as XeroTokenResponse;
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Fetch tenant list (which Xero organisations this token has access to)
    const tenantsRes = await fetch('https://api.xero.com/connections', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
    });

    let tenantId = '';
    let tenantName = '';
    if (tenantsRes.ok) {
      const tenants = await tenantsRes.json() as XeroTenant[];
      // Pick the first ORGANISATION tenant
      const org = tenants.find((t) => t.tenantType === 'ORGANISATION') ?? tenants[0];
      if (org) {
        tenantId = org.tenantId;
        tenantName = org.tenantName;
      }
    }

    // Upsert xero_connections row
    await db.execute(sql`
      INSERT INTO xero_connections
        (company_id, tenant_id, tenant_name, access_token, refresh_token, expires_at, connected_at, updated_at)
      VALUES
        (${companyId}, ${tenantId}, ${tenantName}, ${tokens.access_token}, ${tokens.refresh_token}, ${expiresAt}, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        tenant_id     = VALUES(tenant_id),
        tenant_name   = VALUES(tenant_name),
        access_token  = VALUES(access_token),
        refresh_token = VALUES(refresh_token),
        expires_at    = VALUES(expires_at),
        updated_at    = NOW()
    `);

    console.log(`[xero-callback] Connected company ${companyId} to Xero tenant "${tenantName}"`);
    res.redirect('/settings?tab=accounting&xero=connected');
  } catch (err) {
    console.error('[xero-callback] Unexpected error:', err);
    res.redirect('/settings?tab=accounting&xero=error&reason=unexpected');
  }
}
