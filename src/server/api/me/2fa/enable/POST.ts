import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = await getSessionAndProfile(req, res);
    if (!auth) return;

    const userId = auth.session.user.id;
    const { token } = req.body as { token?: string };
    if (!token || !/^\d{6}$/.test(token)) {
      return res.status(400).json({ error: 'A 6-digit code is required.' });
    }

    const rows = (await db.execute(sql.raw(
      `SELECT totp_secret FROM \`user\` WHERE id = '${userId}' LIMIT 1`
    )) as unknown as [Array<{ totp_secret: string | null }>, unknown])[0];

    const secret = rows[0]?.totp_secret;
    if (!secret) return res.status(400).json({ error: 'No pending 2FA setup found. Please restart setup.' });

    const otplib = await import('otplib');
    const result = await otplib.verify({ token, secret });
    if (!result?.valid) return res.status(400).json({ error: 'Invalid code. Please try again.' });

    await db.execute(sql.raw(
      `UPDATE \`user\` SET two_factor_enabled = 1 WHERE id = '${userId}'`
    ));

    res.json({ ok: true });
  } catch (err) {
    console.error('[2fa/enable]', err);
    res.status(500).json({ error: 'Failed to enable 2FA' });
  }
}
