import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = await getSessionAndProfile(req, res);
    if (!auth) return;

    const userId = auth.session.user.id;
    const email  = auth.session.user.email ?? userId;

    const rows = await db.execute(sql.raw(
      `SELECT two_factor_enabled FROM \`user\` WHERE id = '${userId}' LIMIT 1`
    )) as unknown as Array<{ two_factor_enabled: number }>;

    if (rows[0]?.two_factor_enabled) return res.json({ alreadyEnabled: true });

    const [otplib, { default: qrcode }] = await Promise.all([
      import('otplib'),
      import('qrcode'),
    ]);
    const secret = otplib.generateSecret();
    const otpAuthUrl = otplib.generateURI({ secret, label: email, issuer: 'IWILLBUILD' });
    const qrDataUrl = await qrcode.toDataURL(otpAuthUrl);

    // Store pending secret (not yet confirmed)
    await db.execute(sql.raw(
      `UPDATE \`user\` SET totp_secret = '${secret}' WHERE id = '${userId}'`
    ));

    res.json({ secret, qrDataUrl, otpAuthUrl });
  } catch (err) {
    console.error('[2fa/setup]', err);
    res.status(500).json({ error: 'Failed to generate 2FA setup' });
  }
}
