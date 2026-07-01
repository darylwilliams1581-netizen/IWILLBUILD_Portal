/**
 * POST /api/owner-console/users/verify
 * Platform owner only: manually marks a user's email as verified and unlocks their login.
 * Access enforced by requirePlatformOwner middleware in entry.ts.
 * Writes a full audit record to manual_verification_log.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { user } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { sql } from 'drizzle-orm';
import { logActivity } from '../../../../lib/activity-log.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });
    // Platform owner check handled by requirePlatformOwner middleware in entry.ts

    const rawUserId = req.body?.userId;
    const userId = rawUserId != null ? String(rawUserId).trim() : '';
    if (!userId) return res.status(400).json({ error: 'userId is required.' });

    // Fetch target user details before update (for audit log)
    const [targetUser] = await db
      .select({ id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!targetUser) return res.status(404).json({ error: 'User not found.' });
    if (targetUser.emailVerified) {
      return res.status(400).json({ error: 'User is already verified.' });
    }

    // Mark email as verified and record verification method
    await db.update(user)
      .set({ emailVerified: true, verificationMethod: 'manual_owner', updatedAt: new Date() })
      .where(eq(user.id, userId));

    // Clean up any pending email-verification tokens
    await db.execute(
      sql`DELETE FROM verification WHERE identifier = ${'email-verify:' + userId}`
    );

    // Write audit record — use raw SQL so we can include email columns
    // that may have been added by the startup migration after initial deploy.
    try {
      await db.execute(sql`
        INSERT INTO manual_verification_log
          (target_user_id, verified_by_user_id, method, note, target_user_email, verified_by_email)
        VALUES (
          ${userId},
          ${session.user.id},
          ${'manual_owner'},
          ${'Manually verified via Owner Console'},
          ${targetUser.email ?? null},
          ${session.user.email ?? null}
        )
      `);
    } catch (auditErr) {
      // Non-fatal — log but don't fail the request
      console.warn('[owner-console/verify] audit log insert failed:', auditErr);
    }

    console.log(
      `[owner-console] manual verify: target=${targetUser.email} (${userId})` +
      ` by owner=${session.user.email} (${session.user.id})` +
      ` at=${new Date().toISOString()}`
    );

    void logActivity({
      eventType: 'manual_verified',
      success: true,
      userId,
      email: targetUser.email ?? null,
      performedByUserId: session.user.id,
    });

    return res.json({
      ok: true,
      user: { ...targetUser, emailVerified: true, verificationMethod: 'manual_owner' },
    });
  } catch (err) {
    console.error('owner-console/users/verify.error', err);
    return res.status(500).json({ error: 'Failed to verify user.' });
  }
}
