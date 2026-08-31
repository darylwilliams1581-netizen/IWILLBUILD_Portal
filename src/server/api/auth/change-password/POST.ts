/**
 * POST /api/auth/change-password
 * Authenticated user — changes their own password.
 * Used for both voluntary changes and forced changes (must_change_password = 1).
 *
 * Body: { currentPassword: string, newPassword: string }
 *
 * On success:
 *  - Updates password hash in account table
 *  - Clears must_change_password flag
 *  - Logs password_changed activity event
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { logActivity } from '../../../lib/activity-log.js';

async function getSession(req: Request) {
  const auth = getAuth();
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
  }
  return auth.api.getSession({ headers });
}

function isStrongPassword(pw: string): boolean {
  return pw.length >= 8 && /\d/.test(pw) && /[^a-zA-Z0-9]/.test(pw);
}

export default async function handler(req: Request, res: Response) {
  try {
    const session = await getSession(req);
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required.' });
    }
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ error: 'New password must be at least 8 characters and include a number and a symbol.' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from your current password.' });
    }

    // Get current hashed password from account table
    const [accountRows] = await db.execute(
      sql`SELECT password FROM account WHERE user_id = ${session.user.id} AND provider_id = 'credential' LIMIT 1`
    ) as unknown as [Array<{ password: string | null }>, unknown];
    const currentHash = accountRows?.[0]?.password;
    if (!currentHash) {
      return res.status(400).json({ error: 'No password set on this account.' });
    }

    // Verify current password — handle both legacy bcrypt hashes ($2b$...) and
    // BetterAuth's scrypt format (salt:key). Accounts created before this fix
    // may still have bcrypt hashes; we verify them correctly here and always
    // write the new password in scrypt format so the account is migrated forward.
    const { verifyPassword, hashPassword } = await import('better-auth/crypto');
    let valid = false;
    if (currentHash.startsWith('$2')) {
      // Legacy bcrypt hash — use bcryptjs to verify
      const { compare } = await import('bcryptjs');
      valid = await compare(currentPassword, currentHash);
    } else {
      // BetterAuth scrypt format (salt:key)
      valid = await verifyPassword({ hash: currentHash, password: currentPassword });
    }
    if (!valid) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    // Check if this was a forced change (must_change_password was set)
    const [profileRows] = await db.execute(
      sql`SELECT must_change_password FROM profiles WHERE user_id = ${session.user.id} LIMIT 1`
    ) as unknown as [Array<{ must_change_password: number | null }>, unknown];
    const wasForced = !!profileRows?.[0]?.must_change_password;

    // Always write new password in BetterAuth's scrypt format
    const newHash = await hashPassword(newPassword);

    // Update password
    await db.execute(sql`
      UPDATE account
      SET password = ${newHash}, updated_at = NOW()
      WHERE user_id = ${session.user.id} AND provider_id = 'credential'
    `);

    // Clear must_change_password flag
    await db.execute(sql`
      UPDATE profiles SET must_change_password = 0 WHERE user_id = ${session.user.id}
    `);

    void logActivity({
      eventType: wasForced ? 'forced_password_change_completed' : 'password_changed',
      success: true,
      userId: session.user.id,
      email: session.user.email ?? '',
      reason: wasForced ? 'User completed forced password change' : 'User changed their own password',
    });

    return res.json({ ok: true, message: 'Password changed successfully.' });
  } catch (err) {
    console.error('auth/change-password POST error:', err);
    return res.status(500).json({ error: 'Failed to change password.' });
  }
}
