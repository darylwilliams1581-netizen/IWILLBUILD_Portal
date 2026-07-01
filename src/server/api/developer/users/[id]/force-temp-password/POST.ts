/**
 * POST /api/developer/users/:id/force-temp-password
 * Platform developer only — generates a temporary password, sets must_change_password = 1,
 * and revokes all active sessions. Returns the temp password in the response (shown once).
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

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  // Use Math.random as a fallback — crypto is imported async below for hashing
  let pw = '';
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

export default async function handler(req: Request, res: Response) {
  try {
    const session = await getDevSession(req);
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });
    if (!await isPlatformDev(session.user.id, session.user.email ?? '')) {
      return res.status(403).json({ error: 'Platform developer access required.' });
    }

    const targetUserId = String(req.params.id).trim();
    const reason = (req.body?.reason as string | undefined) ?? 'Temporary password set by developer';

    // Verify user exists
    const [userRows] = await db.execute(
      sql`SELECT id, email FROM user WHERE id = ${targetUserId} LIMIT 1`
    ) as unknown as [Array<{ id: string; email: string }>, unknown];
    const targetUser = userRows?.[0];
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    // Generate and hash temp password
    const tempPassword = generateTempPassword();
    const { hash } = await import('bcryptjs');
    const hashedPassword = await hash(tempPassword, 12);

    // Update password in account table
    await db.execute(sql`
      UPDATE account
      SET password = ${hashedPassword}, updated_at = NOW()
      WHERE user_id = ${targetUserId} AND provider_id = 'credential'
    `);

    // Set must_change_password flag
    await db.execute(sql`
      UPDATE profiles SET must_change_password = 1, updated_at = NOW()
      WHERE user_id = ${targetUserId}
    `);

    // Revoke all active sessions
    try {
      const auth = getAuth();
      await auth.api.revokeUserSessions({ body: { userId: targetUserId } });
    } catch { /* non-critical */ }

    // Audit log
    try {
      await db.execute(sql`
        INSERT INTO platform_developer_audit_log
          (action_type, performed_by_user_id, performed_by_email, target_user_id, target_email, reason, created_at)
        VALUES (
          'temporary_password_set', ${session.user.id}, ${session.user.email ?? ''},
          ${targetUserId}, ${targetUser.email}, ${reason}, NOW()
        )
      `);
    } catch { /* non-critical */ }

    void logActivity({
      eventType: 'temporary_password_set',
      success: true,
      userId: targetUserId,
      email: targetUser.email,
      performedByUserId: session.user.id,
      reason,
    });

    return res.json({ ok: true, tempPassword, message: `Temporary password set for ${targetUser.email}. All sessions revoked.` });
  } catch (err) {
    console.error('developer/users/force-temp-password POST error:', err);
    return res.status(500).json({ error: 'Failed to set temporary password.' });
  }
}
