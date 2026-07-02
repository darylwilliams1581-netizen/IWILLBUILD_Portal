/**
 * MYOB AccountRight API client helpers.
 * Mirrors the xero-client.ts pattern.
 *
 * MYOB uses OAuth 2.0 via developer.myob.com.
 * Credentials: MYOB_CLIENT_ID / MYOB_CLIENT_SECRET / MYOB_REDIRECT_URI
 */
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { getSecret } from '#airo/secrets';

interface MyobConnection {
  id: number;
  company_id: number;
  company_file_id: string;
  company_file_name: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

interface MyobTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface MyobCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class MyobNotConnectedError extends Error {
  constructor() { super('MYOB AccountRight is not connected for this company.'); }
}

export class MyobApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`MYOB API error ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

/** Resolve MYOB credentials — company_settings first, then Airo Secrets. */
export async function getMyobCredentials(companyId: number | null): Promise<MyobCredentials | null> {
  if (companyId) {
    try {
      const [rows] = await db.execute(
        sql`SELECT myob_client_id, myob_client_secret, myob_redirect_uri
            FROM company_settings WHERE company_id = ${companyId} LIMIT 1`
      ) as unknown as [Array<{ myob_client_id: string | null; myob_client_secret: string | null; myob_redirect_uri: string | null }>, unknown];
      const row = rows?.[0];
      if (row?.myob_client_id && row?.myob_client_secret && row?.myob_redirect_uri) {
        return { clientId: row.myob_client_id.trim(), clientSecret: row.myob_client_secret.trim(), redirectUri: row.myob_redirect_uri.trim() };
      }
    } catch { /* fall through */ }
  }
  const clientId = getSecret('MYOB_CLIENT_ID');
  const clientSecret = getSecret('MYOB_CLIENT_SECRET');
  const redirectUri = getSecret('MYOB_REDIRECT_URI');
  if (clientId && clientSecret && redirectUri) return { clientId, clientSecret, redirectUri };
  return null;
}

/** Returns a valid access token, refreshing if needed. */
export async function getValidMyobToken(companyId: number): Promise<{ accessToken: string; companyFileId: string; companyFileName: string }> {
  const [rows] = await db.execute(
    sql`SELECT * FROM myob_connections WHERE company_id = ${companyId} LIMIT 1`
  ) as unknown as [MyobConnection[], unknown];

  const conn = rows?.[0];
  if (!conn) throw new MyobNotConnectedError();

  const now = new Date();
  const expiresAt = new Date(conn.expires_at);

  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    const creds = await getMyobCredentials(companyId);
    if (!creds) throw new Error('MYOB credentials not configured');

    const tokenRes = await fetch('https://secure.myob.com/oauth2/v1/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: conn.refresh_token,
      }).toString(),
    });

    if (!tokenRes.ok) {
      await db.execute(sql`DELETE FROM myob_connections WHERE company_id = ${companyId}`);
      throw new MyobNotConnectedError();
    }

    const tokens = await tokenRes.json() as MyobTokenResponse;
    const newExpiry = new Date(Date.now() + tokens.expires_in * 1000);

    await db.execute(sql`
      UPDATE myob_connections
      SET access_token = ${tokens.access_token},
          refresh_token = ${tokens.refresh_token ?? conn.refresh_token},
          expires_at = ${newExpiry.toISOString().slice(0, 19).replace('T', ' ')},
          updated_at = NOW()
      WHERE company_id = ${companyId}
    `);

    return { accessToken: tokens.access_token, companyFileId: conn.company_file_id, companyFileName: conn.company_file_name };
  }

  return { accessToken: conn.access_token, companyFileId: conn.company_file_id, companyFileName: conn.company_file_name };
}

const MYOB_BASE = 'https://api.myob.com/accountright';

/** Authenticated GET to MYOB API. */
export async function myobGet(companyId: number, path: string): Promise<unknown> {
  const { accessToken, companyFileId } = await getValidMyobToken(companyId);
  const url = `${MYOB_BASE}/${companyFileId}${path}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'x-myobapi-version': 'v2', 'Accept': 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw new MyobApiError(res.status, text);
  return JSON.parse(text);
}

/** Authenticated POST to MYOB API. */
export async function myobPost(companyId: number, path: string, body: unknown): Promise<unknown> {
  const { accessToken, companyFileId } = await getValidMyobToken(companyId);
  const url = `${MYOB_BASE}/${companyFileId}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-myobapi-version': 'v2',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new MyobApiError(res.status, text);
  return JSON.parse(text);
}

/** Authenticated PUT to MYOB API. */
export async function myobPut(companyId: number, path: string, body: unknown): Promise<unknown> {
  const { accessToken, companyFileId } = await getValidMyobToken(companyId);
  const url = `${MYOB_BASE}/${companyFileId}${path}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-myobapi-version': 'v2',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new MyobApiError(res.status, text);
  // MYOB PUT returns 200 with no body on success
  if (!text.trim()) return { ok: true };
  return JSON.parse(text);
}
