/**
 * GET /api/integrations/qbo/callback
 * Handles the OAuth 2.0 callback from Intuit.
 * Exchanges the code for tokens and stores the connection.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getQboCredentials } from '../../../../lib/qbo-client.js';

interface QboTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export default async function handler(req: Request, res: Response) {
  try {
    const { code, state, realmId, error: oauthError } = req.query as Record<string, string>;

    if (oauthError) {
      return res.redirect(`/settings?tab=accounting&qbo_error=${encodeURIComponent(oauthError)}`);
    }

    if (!code || !state || !realmId) {
      return res.redirect('/settings?tab=accounting&qbo_error=missing_params');
    }

    let companyId: number;
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
      companyId = Number(decoded.companyId);
      if (!companyId) throw new Error('invalid');
    } catch {
      return res.redirect('/settings?tab=accounting&qbo_error=invalid_state');
    }

    const creds = await getQboCredentials(companyId);
    if (!creds) return res.redirect('/settings?tab=accounting&qbo_error=no_credentials');

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64'),
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: creds.redirectUri,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('QBO token exchange failed:', errText);
      return res.redirect(`/settings?tab=accounting&qbo_error=token_exchange_failed`);
    }

    const tokens = await tokenRes.json() as QboTokenResponse;
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Fetch company info from QBO
    let companyName = 'QuickBooks Company';
    try {
      const infoRes = await fetch(
        `https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`,
        { headers: { 'Authorization': `Bearer ${tokens.access_token}`, 'Accept': 'application/json' } }
      );
      if (infoRes.ok) {
        const info = await infoRes.json() as { CompanyInfo?: { CompanyName?: string } };
        companyName = info?.CompanyInfo?.CompanyName ?? companyName;
      }
    } catch { /* non-fatal */ }

    // Upsert connection
    await db.execute(sql`
      INSERT INTO qbo_connections (company_id, realm_id, company_name, access_token, refresh_token, expires_at)
      VALUES (${companyId}, ${realmId}, ${companyName}, ${tokens.access_token}, ${tokens.refresh_token}, ${expiresAt.toISOString().slice(0, 19).replace('T', ' ')})
      ON DUPLICATE KEY UPDATE
        realm_id = VALUES(realm_id),
        company_name = VALUES(company_name),
        access_token = VALUES(access_token),
        refresh_token = VALUES(refresh_token),
        expires_at = VALUES(expires_at),
        updated_at = NOW()
    `);

    res.redirect('/settings?tab=accounting&qbo_connected=1');
  } catch (err) {
    console.error('GET /api/integrations/qbo/callback error:', err);
    res.redirect('/settings?tab=accounting&qbo_error=server_error');
  }
}
