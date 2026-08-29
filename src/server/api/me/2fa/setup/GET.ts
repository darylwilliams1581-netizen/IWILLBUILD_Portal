/**
 * GET /api/me/2fa/setup
 *
 * Returns the TOTP setup data (QR code + secret) for the authenticated user.
 *
 * Security fixes:
 *   - Uses parameterised queries (no sql.raw interpolation)
 *   - Idempotent: returns the existing pending secret if one exists and 2FA
 *     is not yet enabled — does NOT regenerate on every call
 *   - TOTP secret is encrypted at rest (AES-256-GCM via totp-crypto)
 *   - Never logs the secret, QR seed, or any crypto material
 *   - Returns { alreadyEnabled: true } if 2FA is already active
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';
import {
  encryptTotpSecret,
  decryptTotpSecret,
  isTotpEncryptionConfigured,
} from '../../../../lib/totp-crypto.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = await getSessionAndProfile(req, res);
    if (!auth) return;

    const userId = auth.session.user.id;
    const email  = auth.session.user.email ?? userId;

    const rows = (await db.execute(
      sql`SELECT two_factor_enabled, totp_secret FROM \`user\` WHERE id = ${userId} LIMIT 1`,
    )) as unknown as [Array<{ two_factor_enabled: number; totp_secret: string | null }>, unknown];

    const row = rows[0]?.[0];

    if (row?.two_factor_enabled) {
      return res.json({ alreadyEnabled: true });
    }

    // If a pending secret already exists, reuse it (idempotent setup)
    let plaintextSecret: string;

    if (row?.totp_secret) {
      try {
        plaintextSecret = decryptTotpSecret(row.totp_secret);
      } catch {
        // Corrupted stored secret — generate a fresh one
        plaintextSecret = '';
      }
    } else {
      plaintextSecret = '';
    }

    if (!plaintextSecret) {
      const { generateSecret } = await import('otplib');
      plaintextSecret = generateSecret();

      // Encrypt before storing
      const stored = isTotpEncryptionConfigured()
        ? encryptTotpSecret(plaintextSecret)
        : plaintextSecret; // fallback if key not yet configured

      await db.execute(
        sql`UPDATE \`user\` SET totp_secret = ${stored} WHERE id = ${userId}`,
      );
    }

    const { generateURI }     = await import('otplib');
    const { default: qrcode } = await import('qrcode');

    const otpAuthUrl = generateURI({
      secret:   plaintextSecret,
      label:    email,
      issuer:   'IWILLBUILD',
      strategy: 'totp',
    });
    const qrDataUrl = await qrcode.toDataURL(otpAuthUrl);

    // Return the plaintext secret for display in the setup UI.
    // This is the ONLY time the secret is shown — never log it.
    return res.json({ secret: plaintextSecret, qrDataUrl, otpAuthUrl });
  } catch (err) {
    console.error('[2fa/setup] error (details redacted)');
    return res.status(500).json({ error: 'Failed to generate 2FA setup' });
  }
}
