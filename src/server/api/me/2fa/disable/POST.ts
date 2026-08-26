/**
 * POST /api/me/2fa/disable
 * Body: { password: string, token?: string }
 *
 * Disables TOTP 2FA. Requires current password + optional TOTP code.
 *
 * Security fixes:
 *   - Parameterised queries
 *   - TOTP secret decrypted from encrypted storage
 *   - ±1 time-window tolerance
 *   - Clears backup codes on disable
 *   - Never logs secret or token
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';
import { decryptTotpSecret } from '../../../../lib/totp-crypto.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = await getSessionAndProfile(req, res);
    if (!auth) return;

    const userId = auth.session.user.id;
    const { password, token } = req.body as { password?: string; token?: string };
    if (!password) return res.status(400).json({ error: 'Current password is required.' });

    const rows = (await db.execute(
      sql`SELECT password, totp_secret, two_factor_enabled FROM \`user\` WHERE id = ${userId} LIMIT 1`,
    )) as unknown as [Array<{
      password: string | null;
      totp_secret: string | null;
      two_factor_enabled: number;
    }>, unknown];

    const userRow = rows[0]?.[0];
    if (!userRow) return res.status(404).json({ error: 'User not found.' });
    if (!userRow.two_factor_enabled) return res.status(400).json({ error: '2FA is not enabled.' });

    const { default: bcrypt } = await import('bcryptjs');
    const pwOk = userRow.password ? await bcrypt.compare(password, userRow.password) : false;
    if (!pwOk) return res.status(400).json({ error: 'Incorrect password.' });

    if (token && userRow.totp_secret) {
      let plaintextSecret: string;
      try {
        plaintextSecret = decryptTotpSecret(userRow.totp_secret);
      } catch {
        return res.status(500).json({ error: 'Authentication configuration error.' });
      }

      const { verify } = await import('otplib');
      const result = await verify({ token, secret: plaintextSecret, strategy: 'totp', window: 1 });
      if (!result?.valid) {
        return res.status(400).json({ error: 'Invalid authenticator code.' });
      }
    }

    await db.execute(
      sql`UPDATE \`user\` SET two_factor_enabled = 0, totp_secret = NULL, totp_attempts = 0, totp_locked_until = NULL WHERE id = ${userId}`,
    );

    // Delete backup codes
    await db.execute(
      sql`DELETE FROM totp_backup_codes WHERE user_id = ${userId}`,
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[2fa/disable] error (details redacted)');
    return res.status(500).json({ error: 'Failed to disable 2FA' });
  }
}
