/**
 * POST /api/auth/self-verify
 *
 * Emergency escape hatch — allows the platform OWNER to mark their own
 * email as verified without needing to receive an email.
 *
 * Only works if:
 *  1. The caller is authenticated (has a valid session)
 *  2. Their profile role is 'owner'
 *
 * This is intentionally restricted to owners only. Regular users cannot
 * bypass email verification this way.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles, user } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user?.id) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }

    // Only platform owners can self-verify
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });

    if (profile?.role !== 'owner') {
      return res.status(403).json({
        error: 'Self-verification is only available to platform owners. Contact your administrator.',
      });
    }

    // Mark as verified
    await db.update(user).set({ emailVerified: true }).where(eq(user.id, session.user.id));

    // Clean up any pending verification tokens
    await db.execute(
      sql`DELETE FROM verification WHERE identifier = ${'email-verify:' + session.user.id}`
    );

    console.log(`[self-verify] owner ${session.user.id} (${session.user.email}) self-verified their account`);

    return res.json({ ok: true, message: 'Email verified. You can now access the portal.' });
  } catch (err) {
    console.error('self-verify.error', err);
    return res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
}
