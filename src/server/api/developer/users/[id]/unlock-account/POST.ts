/**
 * POST /api/developer/users/:id/unlock-account
 * Platform developer only — clears lockout_until and resets failed login attempt counters.
 *
 * Body: { reason?: string }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { PLATFORM_OWNER_EMAILS } from '../../../../../lib/platform-owner-guard.js';
import { logActivity } from '../../../../../lib/activity-log.js';

async function getDevSession(req: Request) {
  const auth = getAuth();
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
  }
  return auth.api.getSession({ headers });
}

async function isPlatformDev(userId: string, email: string): Promise<boolean> {
  if (PLATFORM_OWNER_EMAILS.has(email.toLowerCase())) return true;
  try {
    const [rows] = await db.execute(
      sql`SELECT platform_role FROM profiles WHERE user_id = ${userId} LIMIT 1`
    ) as unknown as [Array<{ platform_role: string | null }>, unknown];
    return rows?.[0]?.platform_role === 'developer';
  } catch { return false; }
}

export default async function handler(req: Request, res: Response) {
  try {
    const session = await getDevSession(req);
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });
    if (!await isPlatformDev(session.user.id, session.user.email ?? '')) {
      return res.status(403).json({ error: 'Platform developer access required.' });
    }

    const targetUserId = String(req.params.id).trim();
    const reason = (req.body?.reason as string | undefined) ?? 'Account unlocked by developer';

    // Verify user exists
    const [userRows] = await db.execute(
      sql`SELECT id, email FROM user WHERE id = ${targetUserId} LIMIT 1`
    ) as unknown as [Array<{ id: string; email: string }>, unknown];
    const targetUser = userRows?.[0];
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    // Clear lockout_until on profiles
    await db.execute(sql`
      UPDATE profiles SET lockout_until = NULL, updated_at = NOW()
      WHERE user_id = ${targetUserId}
    `);

    // Clear PIN login attempt counters if table exists
    try {
      await db.execute(sql`
        DELETE FROM pin_login_attempts WHERE user_id = ${targetUserId}
      `);
    } catch { /* table may not exist */ }

    // Audit log
    try {
      await db.execute(sql`
        INSERT INTO platform_developer_audit_log
          (action_type, performed_by_user_id, performed_by_email, target_user_id, target_email, reason, created_at)
        VALUES (
          'account_unlocked', ${session.user.id}, ${session.user.email ?? ''},
          ${targetUserId}, ${targetUser.email}, ${reason}, NOW()
        )
      `);
    } catch { /* non-critical */ }

    void logActivity({
      eventType: 'account_unlocked',
      success: true,
      userId: targetUserId,
      email: targetUser.email,
      performedByUserId: session.user.id,
      reason,
    });

    return res.json({ ok: true, message: `Account unlocked for ${targetUser.email}.` });
  } catch (err) {
    console.error('developer/users/unlock-account POST error:', err);
    return res.status(500).json({ error: 'Failed to unlock account.' });
  }
}
