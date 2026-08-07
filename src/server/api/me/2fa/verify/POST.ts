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

    const rows = await db.execute(sql.raw(
      `SELECT totp_secret, two_factor_enabled FROM \`user\` WHERE id = '${userId}' LIMIT 1`
    )) as unknown as Array<{ totp_secret: string | null; two_factor_enabled: number }>;

    const userRow = rows[0];
    if (!userRow?.two_factor_enabled || !userRow.totp_secret) {
      return res.json({ ok: true }); // 2FA not set up — let through
    }

    const otplib = await import('otplib');
    const result = await otplib.verify({ token, secret: userRow.totp_secret });
    if (!result?.valid) return res.status(400).json({ error: 'Invalid code. Please try again.' });

    res.json({ ok: true });
  } catch (err) {
    console.error('[2fa/verify]', err);
    res.status(500).json({ error: 'Verification failed' });
  }
}
