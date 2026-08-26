/**
 * PUT /api/me/phone
 * Body: { phone: string }
 *
 * Saves a new phone number for the user.
 * Clears phone_verified — the user must re-verify the new number.
 * Does NOT touch emailVerified or verificationMethod.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { user, smsVerificationCodes } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { normalisePhone } from '../../../lib/normalise-phone.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const { phone } = req.body as { phone?: string };
    if (!phone?.trim()) return res.status(400).json({ error: 'Phone number is required.' });

    const raw        = phone.trim().replace(/\s+/g, '');
    const normalised = normalisePhone(raw);
    if (normalised.length < 8 || normalised.length > 20) {
      return res.status(400).json({ error: 'Please enter a valid phone number.' });
    }

    // Save phone number, clear phone_verified (must re-verify new number).
    // emailVerified and verificationMethod are intentionally NOT touched.
    await db
      .update(user)
      .set({
        phoneNumber:   normalised,
        phoneVerified: false,
        updatedAt:     new Date(),
      })
      .where(eq(user.id, session.user.id));

    // Clear any existing SMS verification codes for this user
    await db
      .delete(smsVerificationCodes)
      .where(eq(smsVerificationCodes.userId, session.user.id));

    return res.json({ ok: true, phoneNumber: normalised });
  } catch (err) {
    console.error('PUT /api/me/phone error');
    return res.status(500).json({ error: 'Failed to save phone number.' });
  }
}
