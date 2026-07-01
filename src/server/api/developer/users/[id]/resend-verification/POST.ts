/**
 * POST /api/developer/users/:id/resend-verification
 * Platform developer only — resends the email verification link.
 * Falls back gracefully if email is not configured.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { user } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { PLATFORM_OWNER_EMAILS } from '../../../../../lib/platform-owner-guard.js';
import { sql } from 'drizzle-orm';

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

async function logAudit(params: {
  performedByUserId: string;
  performedByEmail: string;
  targetUserId: string;
  targetEmail: string;
  targetCompanyId: number | null;
}) {
  try {
    await db.execute(sql`
      INSERT INTO developer_audit_log
        (action_type, performed_by_user_id, performed_by_email, target_user_id, target_email, target_company_id, reason, created_at)
      VALUES (
        'verification_email_resent', ${params.performedByUserId}, ${params.performedByEmail},
        ${params.targetUserId}, ${params.targetEmail}, ${params.targetCompanyId},
        NULL, NOW()
      )
    `);
  } catch (e) {
    console.warn('[developer-audit] insert failed:', (e as Error)?.message?.slice(0, 120));
  }
}

export default async function handler(req: Request, res: Response) {
  try {
    const session = await getDevSession(req);
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });
    if (!await isPlatformDev(session.user.id, session.user.email ?? '')) {
      return res.status(403).json({ error: 'Platform developer access required.' });
    }

    const targetUserId = req.params.id;

    const [targetUser] = await db
      .select({ id: user.id, email: user.email, emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, targetUserId))
      .limit(1);

    if (!targetUser) return res.status(404).json({ error: 'User not found.' });
    if (targetUser.emailVerified) {
      return res.status(400).json({ error: 'User email is already verified.' });
    }

    // Fetch company id for audit
    const [profRows] = await db.execute(
      sql`SELECT company_id FROM profiles WHERE user_id = ${targetUserId} LIMIT 1`
    ) as unknown as [Array<{ company_id: number | null }>, unknown];
    const companyId = profRows?.[0]?.company_id ?? null;

    // Attempt to send via BetterAuth's built-in resend
    let emailSent = false;
    try {
      const auth = getAuth();
      await auth.api.sendVerificationEmail({
        body: { email: targetUser.email ?? '', callbackURL: '/dashboard' },
      });
      emailSent = true;
    } catch (emailErr) {
      console.warn('[developer] resend-verification email failed:', (emailErr as Error)?.message?.slice(0, 120));
    }

    await logAudit({
      performedByUserId: session.user.id,
      performedByEmail: session.user.email ?? '',
      targetUserId,
      targetEmail: targetUser.email ?? '',
      targetCompanyId: companyId,
    });

    return res.json({
      ok: true,
      emailSent,
      message: emailSent
        ? 'Verification email sent.'
        : 'Could not send email (email service may not be configured). Use manual verify instead.',
    });
  } catch (err) {
    console.error('developer/users/resend-verification error:', err);
    return res.status(500).json({ error: 'Failed to resend verification.' });
  }
}
