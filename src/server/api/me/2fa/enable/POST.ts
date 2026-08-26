/**
 * POST /api/me/2fa/enable
 * Body: { token: string }
 *
 * Confirms TOTP setup by verifying the first code from the authenticator app.
 * On success: sets two_factor_enabled = 1 and generates hashed backup codes.
 *
 * Security fixes:
 *   - Parameterised queries (no sql.raw interpolation)
 *   - TOTP secret decrypted from encrypted storage
 *   - ±1 time-window tolerance via otplib v13 window option
 *   - Rate-limited: 5 attempts per account per 15 min
 *   - Backup codes generated and returned (single-use, hashed)
 *   - Never logs secret or token
 */
import type { Request, Response } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';
import { decryptTotpSecret } from '../../../../lib/totp-crypto.js';
import { check2faRate } from '../../../../lib/signup-rate-limiter.js';

const BACKUP_CODE_COUNT = 8;

function hashBackupCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function generateBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () =>
    randomBytes(5).toString('hex').toUpperCase(), // 10-char hex codes
  );
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = await getSessionAndProfile(req, res);
    if (!auth) return;

    const userId = auth.session.user.id;
    const ip     = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
                   || req.socket.remoteAddress || 'unknown';

    if (!check2faRate(ip, userId)) {
      return res.status(429).json({ error: 'Too many attempts. Please wait before trying again.' });
    }

    const { token } = req.body as { token?: string };
    if (!token || !/^\d{6}$/.test(token)) {
      return res.status(400).json({ error: 'A 6-digit code is required.' });
    }

    const rows = (await db.execute(
      sql`SELECT totp_secret FROM \`user\` WHERE id = ${userId} LIMIT 1`,
    )) as unknown as [Array<{ totp_secret: string | null }>, unknown];

    const storedSecret = rows[0]?.[0]?.totp_secret;
    if (!storedSecret) {
      return res.status(400).json({ error: 'No pending 2FA setup found. Please restart setup.' });
    }

    let plaintextSecret: string;
    try {
      plaintextSecret = decryptTotpSecret(storedSecret);
    } catch {
      return res.status(400).json({ error: 'Setup data is invalid. Please restart setup.' });
    }

    const { verify } = await import('otplib');
    const result = await verify({ token, secret: plaintextSecret, strategy: 'totp', window: 1 });
    if (!result?.valid) {
      return res.status(400).json({ error: 'Invalid code. Please try again.' });
    }

    // Enable 2FA
    await db.execute(
      sql`UPDATE \`user\` SET two_factor_enabled = 1 WHERE id = ${userId}`,
    );

    // Generate single-use backup codes
    const plainCodes = generateBackupCodes();

    // Delete any existing backup codes for this user
    await db.execute(
      sql`DELETE FROM totp_backup_codes WHERE user_id = ${userId}`,
    );

    // Insert hashed backup codes
    for (const code of plainCodes) {
      const id   = randomBytes(18).toString('hex');
      const hash = hashBackupCode(code);
      await db.execute(
        sql`INSERT INTO totp_backup_codes (id, user_id, code_hash) VALUES (${id}, ${userId}, ${hash})`,
      );
    }

    // Return plaintext codes — this is the ONLY time they are shown
    return res.json({ ok: true, backupCodes: plainCodes });
  } catch (err) {
    console.error('[2fa/enable] error (details redacted)');
    return res.status(500).json({ error: 'Failed to enable 2FA' });
  }
}
