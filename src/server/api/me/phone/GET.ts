/**
 * GET /api/me/phone
 * Returns the current user's phone number and whether it is verified.
 *
 * phoneVerified is now driven by the dedicated phone_verified column —
 * it no longer piggybacks on emailVerified / verificationMethod.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { user } from '../../../db/schema.js';
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

    const [row] = await db
      .select({
        phoneNumber:    user.phoneNumber,
        phoneVerified:  user.phoneVerified,
      })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1);

    return res.json({
      phoneNumber:   row?.phoneNumber   ?? null,
      phoneVerified: row?.phoneVerified === true,
    });
  } catch (err) {
    console.error('GET /api/me/phone error');
    return res.status(500).json({ error: 'Failed to fetch phone number.' });
  }
}
