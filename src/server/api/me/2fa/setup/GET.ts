import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const profile = (req as unknown as { userProfile?: { userId: string }; userEmail?: string }).userProfile;
    if (!profile) return res.status(401).json({ error: 'Unauthorized' });

    const [rows] = await db.execute(sql.raw(
      `SELECT two_factor_enabled FROM \`user\` WHERE id = '${profile.userId}' LIMIT 1`
    )) as [Array<{ two_factor_enabled: number }>, unknown];

    if (rows[0]?.two_factor_enabled) return res.json({ alreadyEnabled: true });

    const [otplib, { default: qrcode }] = await Promise.all([
      import('otplib'),
      import('qrcode'),
    ]);
    const secret = otplib.generateSecret(20);
    const email = (req as unknown as { userEmail?: string }).userEmail ?? profile.userId;
    const otpAuthUrl = otplib.generateURI({ secret, account: email, issuer: 'IWILLBUILD' });
    const qrDataUrl = await qrcode.toDataURL(otpAuthUrl);

    // Store pending secret (not yet confirmed)
    await db.execute(sql.raw(
      `UPDATE \`user\` SET totp_secret = '${secret}' WHERE id = '${profile.userId}'`
    ));

    res.json({ secret, qrDataUrl, otpAuthUrl });
  } catch (err) {
    console.error('[2fa/setup]', err);
    res.status(500).json({ error: 'Failed to generate 2FA setup' });
  }
}
