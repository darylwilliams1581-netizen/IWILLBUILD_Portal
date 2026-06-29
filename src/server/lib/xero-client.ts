/**
 * Xero API client helpers.
 * - getValidXeroToken: returns a fresh access token, refreshing if needed.
 * - xeroGet / xeroPost / xeroPut: authenticated Xero API calls.
 */
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { getXeroCredentials } from './xero-credentials.js';

interface XeroConnection {
  id: number;
  company_id: number;
  tenant_id: string;
  tenant_name: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

interface XeroTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export class XeroNotConnectedError extends Error {
  constructor() { super('Xero is not connected for this company.'); }
}

export class XeroApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Xero API error ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

/** Fetch the Xero connection for a company, refreshing the token if expired. */
export async function getValidXeroToken(companyId: number): Promise<{ accessToken: string; tenantId: string; tenantName: string }> {
  const [rows] = await db.execute(
    sql`SELECT * FROM xero_connections WHERE company_id = ${companyId} LIMIT 1`
  ) as unknown as [XeroConnection[], unknown];

  const conn = rows?.[0];
  if (!conn) throw new XeroNotConnectedError();

  const now = new Date();
  const expiresAt = new Date(conn.expires_at);

  // Refresh if within 5 minutes of expiry
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    const creds = await getXeroCredentials(companyId);
    if (!creds) throw new Error('Xero credentials not configured');

    const tokenRes = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: conn.refresh_token,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      // If refresh fails (revoked), delete the connection
      await db.execute(sql`DELETE FROM xero_connections WHERE company_id = ${companyId}`);
      throw new XeroNotConnectedError();
    }

    const tokens = await tokenRes.json() as XeroTokenResponse;
    const newExpiry = new Date(Date.now() + tokens.expires_in * 1000);

    await db.execute(sql`
      UPDATE xero_connections
      SET access_token = ${tokens.access_token},
          refresh_token = ${tokens.refresh_token},
          expires_at = ${newExpiry},
          updated_at = NOW()
      WHERE company_id = ${companyId}
    `);

    return { accessToken: tokens.access_token, tenantId: conn.tenant_id, tenantName: conn.tenant_name };
  }

  return { accessToken: conn.access_token, tenantId: conn.tenant_id, tenantName: conn.tenant_name };
}

const XERO_API = 'https://api.xero.com/api.xro/2.0';

export async function xeroGet(companyId: number, path: string): Promise<unknown> {
  const { accessToken, tenantId } = await getValidXeroToken(companyId);
  const res = await fetch(`${XERO_API}${path}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      'Accept': 'application/json',
    },
  });
  const body = await res.text();
  if (!res.ok) throw new XeroApiError(res.status, body);
  return JSON.parse(body);
}

export async function xeroPost(companyId: number, path: string, payload: unknown): Promise<unknown> {
  const { accessToken, tenantId } = await getValidXeroToken(companyId);
  const res = await fetch(`${XERO_API}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) throw new XeroApiError(res.status, body);
  return JSON.parse(body);
}

export async function xeroPut(companyId: number, path: string, payload: unknown): Promise<unknown> {
  const { accessToken, tenantId } = await getValidXeroToken(companyId);
  const res = await fetch(`${XERO_API}${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) throw new XeroApiError(res.status, body);
  return JSON.parse(body);
}
