/**
 * DELETE /api/developer/users/:id/sessions
 * Platform developer only — revokes ALL active sessions for a user (force logout).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { session as sessionTable, profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
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
    const devSession = await getDevSession(req);
    if (!devSession?.user) return res.status(401).json({ error: 'Unauthorised' });
    if (!await isPlatformDev(devSession.user.id, devSession.user.email ?? '')) {
      return res.status(403).json({ error: 'Platform developer access required.' });
    }

    const targetUserId = req.params.id;
    const { reason } = req.body as { reason?: string };

    const [userRows] = await db.execute(
      sql`SELECT email FROM user WHERE id = ${targetUserId} LIMIT 1`
    ) as unknown as [Array<{ email: string }>, unknown];
    const targetEmail = userRows?.[0]?.email ?? '';

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, targetUserId) });

    await db.delete(sessionTable).where(eq(sessionTable.userId, targetUserId));

    try {
      await db.execute(sql`
        INSERT INTO developer_audit_log
          (action_type, performed_by_user_id, performed_by_email, target_user_id, target_email, target_company_id, reason, created_at)
        VALUES (
          'sessions_revoked', ${devSession.user.id}, ${devSession.user.email ?? ''},
          ${targetUserId}, ${targetEmail}, ${profile?.companyId ?? null},
          ${reason?.trim() ?? null}, NOW()
        )
      `);
    } catch { /* non-critical */ }

    void logActivity({
      eventType: 'sessions_revoked',
      success: true,
      userId: targetUserId,
      email: targetEmail,
      companyId: profile?.companyId ?? null,
      performedByUserId: devSession.user.id,
      reason: reason?.trim() ?? 'Force logout by developer',
    });

    return res.json({ ok: true, message: 'All sessions revoked. User will be logged out on next request.' });
  } catch (err) {
    console.error('developer/users/sessions DELETE error:', err);
    return res.status(500).json({ error: 'Failed to revoke sessions.' });
  }
}
