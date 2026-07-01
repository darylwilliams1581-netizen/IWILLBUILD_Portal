/**
 * DELETE /api/developer/users/:id/impersonate
 * Ends an active impersonation session by clearing the cookie.
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
    res.clearCookie('iwb_impersonate', { path: '/' });

    try {
      await db.execute(sql`
        INSERT INTO developer_audit_log
          (action_type, performed_by_user_id, performed_by_email, target_user_id, target_email, reason, created_at)
        VALUES (
          'impersonation_ended', ${session.user.id}, ${session.user.email ?? ''},
          ${targetUserId}, '', NULL, NOW()
        )
      `);
    } catch { /* non-critical */ }

    void logActivity({
      eventType: 'impersonation_ended',
      success: true,
      userId: targetUserId,
      performedByUserId: session.user.id,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('developer/users/impersonate DELETE error:', err);
    return res.status(500).json({ error: 'Failed to end impersonation.' });
  }
}
