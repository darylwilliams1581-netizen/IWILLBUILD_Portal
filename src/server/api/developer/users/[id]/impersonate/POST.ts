/**
 * POST /api/developer/users/:id/impersonate
 * Platform developer only — starts a read-only impersonation session.
 * Sets a cookie `iwb_impersonate` readable by the frontend for the banner.
 * Every action is audited. Passwords/secrets are never exposed.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
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
    const session = await getDevSession(req);
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });
    if (!await isPlatformDev(session.user.id, session.user.email ?? '')) {
      return res.status(403).json({ error: 'Platform developer access required.' });
    }

    const targetUserId = req.params.id;
    if (targetUserId === session.user.id) {
      return res.status(400).json({ error: 'You cannot impersonate yourself.' });
    }

    const [userRows] = await db.execute(
      sql`SELECT id, email, name FROM user WHERE id = ${targetUserId} LIMIT 1`
    ) as unknown as [Array<{ id: string; email: string; name: string | null }>, unknown];
    const targetUser = userRows?.[0];
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, targetUserId) });

    const payload = {
      targetUserId,
      targetEmail: targetUser.email,
      targetName: targetUser.name ?? targetUser.email,
      targetRole: profile?.role ?? 'unknown',
      targetCompanyId: profile?.companyId ?? null,
      devUserId: session.user.id,
      devEmail: session.user.email ?? '',
      startedAt: new Date().toISOString(),
      readOnly: true,
    };

    // httpOnly: false so the frontend JS can read it for the banner
    const cookieValue = Buffer.from(JSON.stringify(payload)).toString('base64');
    res.cookie('iwb_impersonate', cookieValue, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 2 * 60 * 60 * 1000,
      path: '/',
    });

    try {
      await db.execute(sql`
        INSERT INTO developer_audit_log
          (action_type, performed_by_user_id, performed_by_email, target_user_id, target_email, target_company_id, reason, created_at)
        VALUES (
          'impersonation_started', ${session.user.id}, ${session.user.email ?? ''},
          ${targetUserId}, ${targetUser.email}, ${profile?.companyId ?? null},
          ${req.body?.reason ?? null}, NOW()
        )
      `);
    } catch { /* non-critical */ }

    void logActivity({
      eventType: 'impersonation_started',
      success: true,
      userId: targetUserId,
      email: targetUser.email,
      companyId: profile?.companyId ?? null,
      performedByUserId: session.user.id,
      reason: req.body?.reason ?? 'Developer support session',
    });

    return res.json({ ok: true, payload });
  } catch (err) {
    console.error('developer/users/impersonate POST error:', err);
    return res.status(500).json({ error: 'Failed to start impersonation.' });
  }
}
