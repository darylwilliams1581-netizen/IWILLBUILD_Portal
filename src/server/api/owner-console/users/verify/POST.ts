/**
 * POST /api/owner-console/users/verify
 * Owner only — manually mark a user's email as verified (unlock their account).
 * Body: { userId: string }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles, user } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const callerProfile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (callerProfile?.role !== 'owner') {
      return res.status(403).json({ error: 'Owner access required.' });
    }

    const { userId } = req.body as { userId?: string };
    if (!userId?.trim()) return res.status(400).json({ error: 'userId is required.' });

    // Mark email as verified
    await db.update(user).set({ emailVerified: true }).where(eq(user.id, userId));

    // Clean up any pending verification tokens
    await db.execute(
      sql`DELETE FROM verification WHERE identifier = ${'email-verify:' + userId}`
    );

    const [updated] = await db
      .select({ id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    console.log(`[owner-console] manually verified email for user ${userId} (${updated?.email}) by owner ${session.user.id}`);

    return res.json({ ok: true, user: updated });
  } catch (err) {
    console.error('owner-console/users/verify.error', err);
    return res.status(500).json({ error: 'Failed to verify user.' });
  }
}
