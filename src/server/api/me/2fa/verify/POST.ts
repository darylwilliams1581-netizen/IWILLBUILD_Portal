import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const profile = (req as unknown as { userProfile?: { userId: string } }).userProfile;
    if (!profile) return res.status(401).json({ error: 'Unauthorized' });

    const { token } = req.body as { token?: string };
    if (!token || !/^\d{6}$/.test(token)) {
      return res.status(400).json({ error: 'A 6-digit code is required.' });
    }

    const [rows] = await db.execute(sql.raw(
      `SELECT totp_secret, two_factor_enabled FROM \`user\` WHERE id = '${profile.userId}' LIMIT 1`
    )) as [Array<{ totp_secret: string | null; two_factor_enabled: number }>, unknown];

    const user = rows[0];
    if (!user?.two_factor_enabled || !user.totp_secret) {
      return res.json({ ok: true }); // 2FA not set up — let through
    }

    const otplib = await import('otplib');
    const result = await otplib.verify({ token, secret: user.totp_secret });
    if (!result?.valid) return res.status(400).json({ error: 'Invalid code. Please try again.' });

    res.json({ ok: true });
  } catch (err) {
    console.error('[2fa/verify]', err);
    res.status(500).json({ error: 'Verification failed' });
  }
}
