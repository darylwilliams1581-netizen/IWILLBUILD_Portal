import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = await getSessionAndProfile(req, res);
    if (!auth) return;

    const userId = auth.session.user.id;
    const { password, token } = req.body as { password?: string; token?: string };
    if (!password) return res.status(400).json({ error: 'Current password is required.' });

    const rows = (await db.execute(sql.raw(
      `SELECT password, totp_secret, two_factor_enabled FROM \`user\` WHERE id = '${userId}' LIMIT 1`
    )) as unknown as [Array<{ password: string | null; totp_secret: string | null; two_factor_enabled: number }>, unknown])[0];

    const userRow = rows[0];
    if (!userRow) return res.status(404).json({ error: 'User not found.' });
    if (!userRow.two_factor_enabled) return res.status(400).json({ error: '2FA is not enabled.' });

    const { default: bcrypt } = await import('bcryptjs');
    const pwOk = userRow.password ? await bcrypt.compare(password, userRow.password) : false;
    if (!pwOk) return res.status(400).json({ error: 'Incorrect password.' });

    if (token && userRow.totp_secret) {
      const otplib = await import('otplib');
      const result = await otplib.verify({ token, secret: userRow.totp_secret });
      if (!result?.valid) return res.status(400).json({ error: 'Invalid authenticator code.' });
    }

    await db.execute(sql.raw(
      `UPDATE \`user\` SET two_factor_enabled = 0, totp_secret = NULL WHERE id = '${userId}'`
    ));

    res.json({ ok: true });
  } catch (err) {
    console.error('[2fa/disable]', err);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
}
