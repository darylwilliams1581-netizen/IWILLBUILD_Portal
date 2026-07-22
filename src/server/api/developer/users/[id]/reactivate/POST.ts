/**
 * POST /api/developer/users/:id/reactivate
 * Platform developer only — reactivates a deactivated user account.
 * Sets profiles.status = 'active'. Does NOT auto-verify email.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { PLATFORM_OWNER_EMAILS } from '../../../../../lib/platform-owner-guard.js';
import { sql } from 'drizzle-orm';
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

async function logAudit(params: {
  actionType: string;
  performedByUserId: string;
  performedByEmail: string;
  targetUserId: string;
  targetEmail: string;
  targetCompanyId: number | null;
  reason: string | null;
}) {
  try {
    await db.execute(sql`
      INSERT INTO developer_audit_log
        (action_type, performed_by_user_id, performed_by_email, target_user_id, target_email, target_company_id, reason, created_at)
      VALUES (
        ${params.actionType}, ${params.performedByUserId}, ${params.performedByEmail},
        ${params.targetUserId}, ${params.targetEmail}, ${params.targetCompanyId},
        ${params.reason}, NOW()
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
    const { reason } = req.body as { reason?: string };

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, targetUserId) });
    if (!profile) return res.status(404).json({ error: 'User not found.' });
    if (profile.status === 'active') return res.status(400).json({ error: 'User is already active.' });

    await db.update(profiles).set({ status: 'active', updatedAt: new Date() }).where(eq(profiles.userId, targetUserId));

    const [userRows] = await db.execute(
      sql`SELECT email FROM user WHERE id = ${targetUserId} LIMIT 1`
    ) as unknown as [Array<{ email: string }>, unknown];
    const targetEmail = userRows?.[0]?.email ?? '';

    await logAudit({
      actionType: 'user_reactivated',
      performedByUserId: session.user.id,
      performedByEmail: session.user.email ?? '',
      targetUserId,
      targetEmail,
      targetCompanyId: profile.companyId ?? null,
      reason: reason?.trim() || null,
    });

    console.log(`[developer] reactivate: target=${targetEmail} (${targetUserId}) by=${session.user.email}`);

    void logActivity({
      eventType: 'account_reactivated',
      success: true,
      userId: targetUserId,
      email: targetEmail,
      companyId: profile.companyId ?? null,
      performedByUserId: session.user.id,
      reason: reason?.trim() || null,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('developer/users/reactivate error:', err);
    return res.status(500).json({ error: 'Failed to reactivate user.' });
  }
}
