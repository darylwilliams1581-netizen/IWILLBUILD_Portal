/**
 * GET /api/me/2fa/status
 * Returns the current 2FA state for the authenticated user.
 *
 * Security fix: parameterised query (no sql.raw interpolation).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = await getSessionAndProfile(req, res);
    if (!auth) return;

    const rows = (await db.execute(
      sql`SELECT two_factor_enabled, sms_2fa_enabled, sms_2fa_phone
          FROM \`user\` WHERE id = ${auth.session.user.id} LIMIT 1`,
    )) as unknown as [Array<{
      two_factor_enabled: number;
      sms_2fa_enabled: number;
      sms_2fa_phone: string | null;
    }>, unknown];

    const row        = rows[0]?.[0];
    const totpEnabled = !!row?.two_factor_enabled;
    const smsEnabled  = !!row?.sms_2fa_enabled;
    const enabled     = totpEnabled || smsEnabled;
    const method      = smsEnabled ? 'sms' : totpEnabled ? 'totp' : null;

    let maskedPhone: string | undefined;
    if (smsEnabled && row?.sms_2fa_phone) {
      maskedPhone = row.sms_2fa_phone.replace(/\d(?=\d{4})/g, '*');
    }

    return res.json({ enabled, method, maskedPhone });
  } catch (err) {
    console.error('[2fa/status] error (details redacted)');
    return res.status(500).json({ error: 'Failed to fetch 2FA status' });
  }
}
