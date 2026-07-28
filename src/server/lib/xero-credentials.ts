/**
 * xero-credentials.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolves Xero OAuth credentials for a given company.
 *
 * Priority:
 *   1. Company-specific values stored in company_settings (set via Settings → Accounting)
 *   2. Platform-level Airo Secrets (XERO_CLIENT_ID / XERO_CLIENT_SECRET / XERO_REDIRECT_URI)
 *
 * This lets the owner configure Xero directly from within the portal UI
 * without needing to touch Airo Secrets.
 */
import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { getSecret } from '#airo/secrets';

export interface XeroCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface CompanySettingsRow {
  xero_client_id: string | null;
  xero_client_secret: string | null;
  xero_redirect_uri: string | null;
}

/**
 * Returns Xero credentials for the given company, or null if not configured.
 * Pass companyId = null to skip the DB lookup and only check platform secrets.
 */
export async function getXeroCredentials(companyId: number | null): Promise<XeroCredentials | null> {
  // 1. Try company-specific credentials from company_settings
  if (companyId) {
    try {
      const [rows] = await db.execute(
        sql`SELECT xero_client_id, xero_client_secret, xero_redirect_uri
            FROM company_settings
            WHERE company_id = ${companyId}
            LIMIT 1`
      ) as unknown as [CompanySettingsRow[], unknown];

      const row = rows?.[0];
      if (row?.xero_client_id && row?.xero_client_secret && row?.xero_redirect_uri) {
        return {
          clientId: row.xero_client_id.trim(),
          clientSecret: row.xero_client_secret.trim(),
          redirectUri: row.xero_redirect_uri.trim(),
        };
      }
    } catch {
      // Fall through to platform secrets
    }
  }

  // 2. Fall back to platform-level Airo Secrets
  const clientId = getSecret('XERO_CLIENT_ID');
  const clientSecret = getSecret('XERO_CLIENT_SECRET');
  const redirectUri = getSecret('XERO_REDIRECT_URI');

  if (clientId && clientSecret && redirectUri) {
    return { clientId, clientSecret, redirectUri };
  }

  return null;
}

/**
 * Returns true if Xero credentials are configured for this company
 * (either in company_settings or platform secrets).
 */
export async function isXeroConfigured(companyId: number | null): Promise<boolean> {
  const creds = await getXeroCredentials(companyId);
  return creds !== null;
}
