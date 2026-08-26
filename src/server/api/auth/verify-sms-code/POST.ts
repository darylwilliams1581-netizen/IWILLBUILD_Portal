/**
 * POST /api/auth/verify-sms-code
 * Body: { code: string }
 *
 * Verifies the SMS code sent by /api/auth/send-sms-code.
 * On success:
 *   - Sets user.phone_verified = true
 *   - Does NOT modify emailVerified or verificationMethod
 * Max 5 attempts before the code is invalidated.
 */
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { db } from '../../../db/client.js';
import { smsVerificationCodes, user } from '../../../db/schema.js';
import { eq, and, gt } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const { code } = req.body as { code?: string };
    if (!code?.trim()) return res.status(400).json({ error: 'Verification code is required.' });

    const now = new Date();

    // Find active code for this user (non-2FA codes — no '2fa:' or 'setup:' prefix)
    const [row] = await db
      .select()
      .from(smsVerificationCodes)
      .where(
        and(
          eq(smsVerificationCodes.userId, session.user.id),
          gt(smsVerificationCodes.expiresAt, now),
        ),
      )
      .limit(1);

    if (!row) {
      return res.status(400).json({ error: 'No active verification code found. Please request a new code.' });
    }

    // Only process account-recovery codes (not 2FA or setup codes)
    if (row.phone.startsWith('2fa:') || row.phone.startsWith('setup:')) {
      return res.status(400).json({ error: 'No active verification code found. Please request a new code.' });
    }

    if (row.verifiedAt) {
      return res.status(400).json({ error: 'This code has already been used.' });
    }

    if (row.attempts >= MAX_ATTEMPTS) {
      await db.delete(smsVerificationCodes).where(eq(smsVerificationCodes.id, row.id));
      return res.status(400).json({ error: 'Too many failed attempts. Please request a new code.' });
    }

    const hashed = hashCode(code.trim());

    if (hashed !== row.codeHash) {
      await db
        .update(smsVerificationCodes)
        .set({ attempts: row.attempts + 1 })
        .where(eq(smsVerificationCodes.id, row.id));

      const remaining = MAX_ATTEMPTS - row.attempts - 1;
      return res.status(400).json({
        error: remaining > 0
          ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Too many failed attempts. Please request a new code.',
      });
    }

    // Mark code as used
    await db
      .update(smsVerificationCodes)
      .set({ verifiedAt: now })
      .where(eq(smsVerificationCodes.id, row.id));

    // Set phone_verified = true ONLY — do NOT touch emailVerified or verificationMethod
    await db
      .update(user)
      .set({ phoneVerified: true, updatedAt: new Date() })
      .where(eq(user.id, session.user.id));

    return res.json({ ok: true, message: 'Phone number verified successfully.' });
  } catch (err) {
    console.error('POST /api/auth/verify-sms-code error');
    return res.status(500).json({ error: 'Failed to verify code.' });
  }
}
