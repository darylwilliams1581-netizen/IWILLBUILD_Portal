/**
 * POST /api/team/verify-user
 * Body: { userId: string; note?: string }
 *
 * Admin/Owner can manually mark a user in their own company as email-verified.
 * Platform owner can verify any user.
 * Logs who verified and when.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { user, profiles, manualVerificationLog } from '../../../db/schema.js';
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

    const callerProfile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!callerProfile?.companyId) return res.status(403).json({ error: 'No company' });

    const isOwner = callerProfile.role === 'owner';
    const isAdmin = callerProfile.role === 'admin' || callerProfile.permAdmin === true;

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Admin access required to manually verify users.' });
    }

    const { userId, note } = req.body as { userId?: string; note?: string };
    if (!userId) return res.status(400).json({ error: 'userId is required.' });

    // Fetch target user
    const [targetUser] = await db
      .select({ id: user.id, emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    // Non-owner admins can only verify users in their own company
    if (!isOwner) {
      const targetProfile = await db.query.profiles.findFirst({
        where: eq(profiles.userId, userId),
      });
      if (!targetProfile || targetProfile.companyId !== callerProfile.companyId) {
        return res.status(403).json({ error: 'You can only verify users in your own company.' });
      }
    }

    // Mark verified
    await db
      .update(user)
      .set({ emailVerified: true, verificationMethod: 'manual_admin', updatedAt: new Date() })
      .where(eq(user.id, userId));

    // Log the action
    const { randomBytes } = await import('node:crypto');
    await db.insert(manualVerificationLog).values({
      id: undefined as unknown as number, // auto-increment
      targetUserId: userId,
      verifiedByUserId: session.user.id,
      method: isOwner ? 'manual_owner' : 'manual_admin',
      note: note?.trim() || null,
    });

    return res.json({ ok: true, message: 'User has been manually verified.' });
  } catch (err) {
    console.error('POST /api/team/verify-user error:', err);
    return res.status(500).json({ error: 'Failed to verify user.' });
  }
}
