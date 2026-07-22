import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const profile = (req as unknown as { userProfile?: { userId: string } }).userProfile;
    if (!profile) return res.status(401).json({ error: 'Unauthorized' });

    const { password, token } = req.body as { password?: string; token?: string };
    if (!password) return res.status(400).json({ error: 'Current password is required.' });

    const [rows] = await db.execute(sql.raw(
      `SELECT password, totp_secret, two_factor_enabled FROM \`user\` WHERE id = '${profile.userId}' LIMIT 1`
    )) as [Array<{ password: string | null; totp_secret: string | null; two_factor_enabled: number }>, unknown];

    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (!user.two_factor_enabled) return res.status(400).json({ error: '2FA is not enabled.' });

    const { default: bcrypt } = await import('bcryptjs');
    const pwOk = user.password ? await bcrypt.compare(password, user.password) : false;
    if (!pwOk) return res.status(400).json({ error: 'Incorrect password.' });

    if (token && user.totp_secret) {
      const otplib = await import('otplib');
      const result = await otplib.verify({ token, secret: user.totp_secret });
      if (!result?.valid) return res.status(400).json({ error: 'Invalid authenticator code.' });
    }

    await db.execute(sql.raw(
      `UPDATE \`user\` SET two_factor_enabled = 0, totp_secret = NULL WHERE id = '${profile.userId}'`
    ));

    res.json({ ok: true });
  } catch (err) {
    console.error('[2fa/disable]', err);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
}
