/**
 * PUT /api/developer/users/:id/role
 * Platform developer only — changes a user's company-level role.
 * Allowed roles: owner | admin | member | viewer
 * Guards: cannot remove the last owner from a company.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq, and, ne } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { PLATFORM_OWNER_EMAILS } from '../../../../../lib/platform-owner-guard.js';
import { sql } from 'drizzle-orm';

const ALLOWED_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
type AllowedRole = typeof ALLOWED_ROLES[number];

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
  meta?: string;
}) {
  try {
    await db.execute(sql`
      INSERT INTO developer_audit_log
        (action_type, performed_by_user_id, performed_by_email, target_user_id, target_email, target_company_id, reason, meta, created_at)
      VALUES (
        ${params.actionType}, ${params.performedByUserId}, ${params.performedByEmail},
        ${params.targetUserId}, ${params.targetEmail}, ${params.targetCompanyId},
        ${params.reason}, ${params.meta ?? null}, NOW()
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
    const { role, reason } = req.body as { role?: string; reason?: string };

    if (!role || !ALLOWED_ROLES.includes(role as AllowedRole)) {
      return res.status(400).json({ error: `Role must be one of: ${ALLOWED_ROLES.join(', ')}` });
    }

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, targetUserId) });
    if (!profile) return res.status(404).json({ error: 'User not found.' });

    const oldRole = profile.role;

    // Guard: cannot demote the last owner in a company
    if (oldRole === 'owner' && role !== 'owner' && profile.companyId) {
      const otherOwners = await db.query.profiles.findMany({
        where: and(
          eq(profiles.companyId, profile.companyId),
          eq(profiles.role, 'owner'),
          ne(profiles.userId, targetUserId)
        ),
      });
      if (otherOwners.length === 0) {
        return res.status(400).json({
          error: 'Cannot remove the last owner from a company. Assign another owner first.',
        });
      }
    }

    await db.update(profiles).set({ role: role as AllowedRole, updatedAt: new Date() }).where(eq(profiles.userId, targetUserId));

    const [userRows] = await db.execute(
      sql`SELECT email FROM user WHERE id = ${targetUserId} LIMIT 1`
    ) as unknown as [Array<{ email: string }>, unknown];
    const targetEmail = userRows?.[0]?.email ?? '';

    await logAudit({
      actionType: 'user_role_changed',
      performedByUserId: session.user.id,
      performedByEmail: session.user.email ?? '',
      targetUserId,
      targetEmail,
      targetCompanyId: profile.companyId ?? null,
      reason: reason?.trim() || null,
      meta: JSON.stringify({ from: oldRole, to: role }),
    });

    console.log(`[developer] role change: target=${targetEmail} ${oldRole} → ${role} by=${session.user.email}`);
    return res.json({ ok: true, role });
  } catch (err) {
    console.error('developer/users/role error:', err);
    return res.status(500).json({ error: 'Failed to change role.' });
  }
}
