/**
 * POST /api/developer/users/:id/force-temp-password
 * Platform developer only — sets a temporary password and forces the user to
 * change it on next login (must_change_password = 1).
 *
 * Body: { reason?: string }
 * Returns: { ok: true, tempPassword: string }
 *
 * Security rules:
 *  - Temp password is returned ONCE in this response and never stored in plain text.
 *  - The hashed value is stored in the `password` column via better-auth's account table.
 *  - must_change_password is set to 1 on the profile.
 *  - All sessions for the target user are revoked.
 *  - Event is audited in both audit log and activity log.
 *  - Plain password is NEVER logged.
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
  // 12 chars: letters + digits + symbol — always meets strength requirements
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const symbols = '!@#$%&*';
  let pw = '';
  for (let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  pw += symbols[Math.floor(Math.random() * symbols.length)];
  pw += Math.floor(Math.random() * 10);
  // Shuffle
  return pw.split('').sort(() => Math.random() - 0.5).join('');
}

export default async function handler(req: Request, res: Response) {
  try {
    const session = await getDevSession(req);
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });
    if (!await isPlatformDev(session.user.id, session.user.email ?? '')) {
      return res.status(403).json({ error: 'Platform developer access required.' });
    }

    const targetUserId = req.params.id;
    const reason = req.body?.reason ?? 'Temporary password set by developer';

    // Verify target user exists
    const [userRows] = await db.execute(
      sql`SELECT id, email FROM user WHERE id = ${targetUserId} LIMIT 1`
    ) as unknown as [Array<{ id: string; email: string }>, unknown];
    const targetUser = userRows?.[0];
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    const tempPassword = generateTempPassword();

    // Hash with bcryptjs (dynamic import per project rules)
    const { hash } = await import('bcryptjs');
    const hashed = await hash(tempPassword, 12);

    // Update the account password in better-auth's account table
    await db.execute(sql`
      UPDATE account
      SET password = ${hashed}, updated_at = NOW()
      WHERE user_id = ${targetUserId} AND provider_id = 'credential'
    `);

    // Set must_change_password flag on profile
    await db.execute(sql`
      UPDATE profiles
      SET must_change_password = 1
      WHERE user_id = ${targetUserId}
    `);

    // Revoke all active sessions
    await db.execute(sql`
      DELETE FROM session WHERE user_id = ${targetUserId}
    `);

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

    // Activity log
    void logActivity({
      eventType: 'temporary_password_set',
      success: true,
      userId: targetUserId,
      email: targetUser.email,
      performedByUserId: session.user.id,
      reason,
    });

    return res.json({ ok: true, tempPassword });
  } catch (err) {
    console.error('developer/users/force-temp-password POST error:', err);
    return res.status(500).json({ error: 'Failed to set temporary password.' });
  }
}
