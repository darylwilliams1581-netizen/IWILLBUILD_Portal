/**
 * QuickBooks Online (QBO) API client helpers.
 * Mirrors the xero-client.ts pattern.
 *
 * QBO uses OAuth 2.0 with the Intuit Identity platform.
 * Credentials: QBO_CLIENT_ID / QBO_CLIENT_SECRET / QBO_REDIRECT_URI
 * (stored in Airo Secrets or company_settings)
 */
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { getSecret } from '#airo/secrets';

interface QboConnection {
  id: number;
  company_id: number;
  realm_id: string;
  company_name: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

interface QboTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
}

export interface QboCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class QboNotConnectedError extends Error {
  constructor() { super('QuickBooks Online is not connected for this company.'); }
}

export class QboApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`QBO API error ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

/** Resolve QBO credentials — company_settings first, then Airo Secrets. */
export async function getQboCredentials(companyId: number | null): Promise<QboCredentials | null> {
  if (companyId) {
    try {
      const [rows] = await db.execute(
        sql`SELECT qbo_client_id, qbo_client_secret, qbo_redirect_uri
            FROM company_settings WHERE company_id = ${companyId} LIMIT 1`
      ) as unknown as [Array<{ qbo_client_id: string | null; qbo_client_secret: string | null; qbo_redirect_uri: string | null }>, unknown];
      const row = rows?.[0];
      if (row?.qbo_client_id && row?.qbo_client_secret && row?.qbo_redirect_uri) {
        return { clientId: row.qbo_client_id.trim(), clientSecret: row.qbo_client_secret.trim(), redirectUri: row.qbo_redirect_uri.trim() };
      }
    } catch { /* fall through */ }
  }
  const clientId = getSecret('QBO_CLIENT_ID');
  const clientSecret = getSecret('QBO_CLIENT_SECRET');
  const redirectUri = getSecret('QBO_REDIRECT_URI');
  if (clientId && clientSecret && redirectUri) return { clientId, clientSecret, redirectUri };
  return null;
}

/** Returns a valid access token, refreshing if needed. */
export async function getValidQboToken(companyId: number): Promise<{ accessToken: string; realmId: string; companyName: string }> {
  const [rows] = await db.execute(
    sql`SELECT * FROM qbo_connections WHERE company_id = ${companyId} LIMIT 1`
  ) as unknown as [QboConnection[], unknown];

  const conn = rows?.[0];
  if (!conn) throw new QboNotConnectedError();

  const now = new Date();
  const expiresAt = new Date(conn.expires_at);

  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    const creds = await getQboCredentials(companyId);
    if (!creds) throw new Error('QBO credentials not configured');

    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64'),
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: conn.refresh_token,
      }).toString(),
    });

    if (!tokenRes.ok) {
      await db.execute(sql`DELETE FROM qbo_connections WHERE company_id = ${companyId}`);
      throw new QboNotConnectedError();
    }

    const tokens = await tokenRes.json() as QboTokenResponse;
    const newExpiry = new Date(Date.now() + tokens.expires_in * 1000);

    await db.execute(sql`
      UPDATE qbo_connections
      SET access_token = ${tokens.access_token},
          refresh_token = ${tokens.refresh_token ?? conn.refresh_token},
          expires_at = ${newExpiry.toISOString().slice(0, 19).replace('T', ' ')},
          updated_at = NOW()
      WHERE company_id = ${companyId}
    `);

    return { accessToken: tokens.access_token, realmId: conn.realm_id, companyName: conn.company_name };
  }

  return { accessToken: conn.access_token, realmId: conn.realm_id, companyName: conn.company_name };
}

const QBO_BASE = 'https://quickbooks.api.intuit.com/v3/company';

/** Authenticated GET to QBO API. */
export async function qboGet(companyId: number, path: string): Promise<unknown> {
  const { accessToken, realmId } = await getValidQboToken(companyId);
  const url = `${QBO_BASE}/${realmId}${path}?minorversion=65`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw new QboApiError(res.status, text);
  return JSON.parse(text);
}

/** Authenticated POST to QBO API. */
export async function qboPost(companyId: number, path: string, body: unknown): Promise<unknown> {
  const { accessToken, realmId } = await getValidQboToken(companyId);
  const url = `${QBO_BASE}/${realmId}${path}?minorversion=65`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new QboApiError(res.status, text);
  return JSON.parse(text);
}
