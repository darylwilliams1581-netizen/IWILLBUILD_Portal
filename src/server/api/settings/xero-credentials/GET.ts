/**
 * GET /api/settings/xero-credentials
 * Returns whether Xero credentials are saved for this company.
 * Never returns the raw secret — only masked hints.
 * Owner only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { getSecret } from '#airo/secrets';

interface CompanySettingsRow {
  xero_client_id: string | null;
  xero_client_secret: string | null;
  xero_redirect_uri: string | null;
}

function mask(val: string | null | undefined): string | null {
  if (!val || val.trim().length < 6) return null;
  const t = val.trim();
  return `${t.slice(0, 4)}...${t.slice(-4)}`;
}

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
    if (profile.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

    const [rows] = await db.execute(
      sql`SELECT xero_client_id, xero_client_secret, xero_redirect_uri
          FROM company_settings WHERE company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [CompanySettingsRow[], unknown];

    const row = rows?.[0];
    const hasCompanyCredentials = !!(
      row?.xero_client_id?.trim() &&
      row?.xero_client_secret?.trim() &&
      row?.xero_redirect_uri?.trim()
    );

    // Also check platform secrets as fallback
    const hasPlatformCredentials = !!(
      getSecret('XERO_CLIENT_ID') &&
      getSecret('XERO_CLIENT_SECRET') &&
      getSecret('XERO_REDIRECT_URI')
    );

    res.json({
      configured: hasCompanyCredentials || hasPlatformCredentials,
      source: hasCompanyCredentials ? 'company' : hasPlatformCredentials ? 'platform' : 'none',
      maskedClientId: hasCompanyCredentials ? mask(row?.xero_client_id) : null,
      redirectUri: hasCompanyCredentials ? row?.xero_redirect_uri?.trim() ?? null : null,
    });
  } catch (error) {
    console.error('GET /api/settings/xero-credentials error:', error);
    res.status(500).json({ error: 'Failed to load credentials' });
  }
}
