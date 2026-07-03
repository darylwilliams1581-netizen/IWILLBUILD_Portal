/**
 * GET /api/integrations/myob/callback
 * Handles the OAuth 2.0 callback from MYOB.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getMyobCredentials } from '../../../../lib/myob-client.js';

interface MyobTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface MyobCompanyFile {
  Id: string;
  Name: string;
  Uri: string;
}

export default async function handler(req: Request, res: Response) {
  try {
    const { code, state, error: oauthError } = req.query as Record<string, string>;

    if (oauthError) {
      return res.redirect(`/settings?tab=accounting&myob_error=${encodeURIComponent(oauthError)}`);
    }

    if (!code || !state) {
      return res.redirect('/settings?tab=accounting&myob_error=missing_params');
    }

    let companyId: number;
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
      companyId = Number(decoded.companyId);
      if (!companyId) throw new Error('invalid');
    } catch {
      return res.redirect('/settings?tab=accounting&myob_error=invalid_state');
    }

    const creds = await getMyobCredentials(companyId);
    if (!creds) return res.redirect('/settings?tab=accounting&myob_error=no_credentials');

    // Exchange code for tokens
    const tokenRes = await fetch('https://secure.myob.com/oauth2/v1/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: creds.redirectUri,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('MYOB token exchange failed:', errText);
      return res.redirect('/settings?tab=accounting&myob_error=token_exchange_failed');
    }

    const tokens = await tokenRes.json() as MyobTokenResponse;
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Fetch company files list
    let companyFileId = '';
    let companyFileName = 'MYOB Company File';
    try {
      const filesRes = await fetch('https://api.myob.com/accountright/', {
        headers: { 'Authorization': `Bearer ${tokens.access_token}`, 'x-myobapi-version': 'v2' },
      });
      if (filesRes.ok) {
        const files = await filesRes.json() as MyobCompanyFile[];
        if (files?.length > 0) {
          companyFileId = files[0].Id;
          companyFileName = files[0].Name;
        }
      }
    } catch { /* non-fatal */ }

    // Upsert connection
    await db.execute(sql`
      INSERT INTO myob_connections (company_id, company_file_id, company_file_name, access_token, refresh_token, expires_at)
      VALUES (${companyId}, ${companyFileId}, ${companyFileName}, ${tokens.access_token}, ${tokens.refresh_token}, ${expiresAt.toISOString().slice(0, 19).replace('T', ' ')})
      ON DUPLICATE KEY UPDATE
        company_file_id = VALUES(company_file_id),
        company_file_name = VALUES(company_file_name),
        access_token = VALUES(access_token),
        refresh_token = VALUES(refresh_token),
        expires_at = VALUES(expires_at),
        updated_at = NOW()
    `);

    res.redirect('/settings?tab=accounting&myob_connected=1');
  } catch (err) {
    console.error('GET /api/integrations/myob/callback error:', err);
    res.redirect('/settings?tab=accounting&myob_error=server_error');
  }
}
