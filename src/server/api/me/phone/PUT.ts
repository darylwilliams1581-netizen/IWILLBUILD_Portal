/**
 * PUT /api/me/phone
 * Body: { phone: string }
 * Saves a new phone number for the user (clears verified status until re-verified).
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { user, smsVerificationCodes } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

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

    // Normalise to E.164 — Twilio requires this format
    const raw = phone.trim().replace(/\s+/g, '');
    const normalised = raw.startsWith('+')
      ? raw
      : raw.startsWith('0')
        ? `+61${raw.slice(1)}`
        : raw;
    if (normalised.length < 8 || normalised.length > 20) {
      return res.status(400).json({ error: 'Please enter a valid phone number.' });
    }

    // Save phone number and clear verified status (must re-verify new number)
    await db
      .update(user)
      .set({ phoneNumber: normalised, verificationMethod: null, updatedAt: new Date() })
      .where(eq(user.id, session.user.id));

    // Clear any existing SMS codes for this user
    await db.delete(smsVerificationCodes).where(eq(smsVerificationCodes.userId, session.user.id));

    return res.json({ ok: true, phoneNumber: normalised });
  } catch (err) {
    console.error('PUT /api/me/phone error:', err);
    return res.status(500).json({ error: 'Failed to save phone number.' });
  }
}
