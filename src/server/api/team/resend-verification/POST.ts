/**
 * POST /api/team/resend-verification
 * Body: { userId: string }
 *
 * Admin/Owner can resend a verification email to a team member.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { user, profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { sendVerificationEmail } from '../../../lib/email-verification.js';

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
    if (!callerProfile?.companyId) return res.status(403).json({ error: 'No company' });

    const isOwner = callerProfile.role === 'owner';
    const isAdmin = callerProfile.role === 'admin' || callerProfile.permAdmin === true;
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const { userId } = req.body as { userId?: string };
    if (!userId) return res.status(400).json({ error: 'userId is required.' });

    // Verify target is in same company (unless platform owner)
    if (!isOwner) {
      const targetProfile = await db.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
      if (!targetProfile || targetProfile.companyId !== callerProfile.companyId) {
        return res.status(403).json({ error: 'You can only manage users in your own company.' });
      }
    }

    const [targetUser] = await db
      .select({ id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!targetUser) return res.status(404).json({ error: 'User not found.' });
    if (targetUser.emailVerified) return res.status(400).json({ error: 'User is already verified.' });

    await sendVerificationEmail(targetUser.id, targetUser.email, targetUser.name ?? 'there');

    return res.json({ ok: true, message: 'Verification email resent.' });
  } catch (err) {
    console.error('POST /api/team/resend-verification error:', err);
    return res.status(500).json({ error: 'Failed to resend verification email.' });
  }
}
