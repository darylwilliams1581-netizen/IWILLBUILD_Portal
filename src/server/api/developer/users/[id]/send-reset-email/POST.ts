/**
 * POST /api/developer/users/:id/send-reset-email
 * Platform developer only — triggers a password reset email for the target user.
 * Reuses the same token generation logic as /api/auth/forgot-password.
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

    const targetUserId = req.params.id;
    const reason = req.body?.reason ?? 'Password reset triggered by developer';

    const [userRows] = await db.execute(
      sql`SELECT id, email FROM user WHERE id = ${targetUserId} LIMIT 1`
    ) as unknown as [Array<{ id: string; email: string }>, unknown];
    const targetUser = userRows?.[0];
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    // Generate reset token (same pattern as forgot-password)
    const { randomBytes, createHash } = await import('node:crypto');
    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min

    // Invalidate any existing tokens for this user
    await db.execute(sql`
      UPDATE password_reset_tokens SET used = 1 WHERE user_id = ${targetUserId} AND used = 0
    `);

    // Insert new token
    await db.execute(sql`
      INSERT INTO password_reset_tokens (user_id, email, token_hash, expires_at, used, created_at)
      VALUES (${targetUserId}, ${targetUser.email}, ${hashedToken}, ${expiresAt}, 0, NOW())
    `);

    // Send email
    const baseUrl = process.env.APP_URL ?? 'https://iwillbuild.com';
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;

    try {
      const { sendEmail } = await import('../../../../../email.js');
      await sendEmail({
        to: targetUser.email,
        subject: 'Reset your IWILLBUILD password',
        html: `
          <p>A password reset was requested for your IWILLBUILD account.</p>
          <p><a href="${resetUrl}" style="background:#F97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Reset Password</a></p>
          <p>This link expires in 30 minutes. If you didn't request this, you can ignore this email.</p>
          <p style="color:#888;font-size:12px;">Or copy this link: ${resetUrl}</p>
        `,
        text: `Reset your IWILLBUILD password:\n\n${resetUrl}\n\nThis link expires in 30 minutes.`,
      });
    } catch (emailErr) {
      console.error('send-reset-email: email send failed:', emailErr);
      return res.status(500).json({ error: 'Failed to send reset email.' });
    }

    // Audit log
    try {
      await db.execute(sql`
        INSERT INTO platform_developer_audit_log
          (action_type, performed_by_user_id, performed_by_email, target_user_id, target_email, reason, created_at)
        VALUES (
          'password_reset_sent', ${session.user.id}, ${session.user.email ?? ''},
          ${targetUserId}, ${targetUser.email}, ${reason}, NOW()
        )
      `);
    } catch { /* non-critical */ }

    void logActivity({
      eventType: 'password_reset_requested',
      success: true,
      userId: targetUserId,
      email: targetUser.email,
      performedByUserId: session.user.id,
      reason,
    });

    return res.json({ ok: true, message: `Password reset email sent to ${targetUser.email}.` });
  } catch (err) {
    console.error('developer/users/send-reset-email POST error:', err);
    return res.status(500).json({ error: 'Failed to send reset email.' });
  }
}
