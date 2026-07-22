/**
 * POST /api/developer/users/:id/assign-company
 * Platform developer only — assigns an orphaned auth user to an existing company,
 * creating a profile for them so they can log in.
 *
 * Body: { companyId: number; role?: string; reason?: string }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles, companies, user } from '../../../../../db/schema.js';
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

const ALLOWED_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
type AllowedRole = typeof ALLOWED_ROLES[number];

export default async function handler(req: Request, res: Response) {
  try {
    const session = await getDevSession(req);
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });
    if (!await isPlatformDev(session.user.id, session.user.email ?? '')) {
      return res.status(403).json({ error: 'Platform developer access required.' });
    }

    const targetUserId = req.params.id;
    const { companyId, role = 'member', reason } = req.body as {
      companyId?: number;
      role?: string;
      reason?: string;
    };

    if (!companyId) return res.status(400).json({ error: 'companyId is required.' });
    if (!ALLOWED_ROLES.includes(role as AllowedRole)) {
      return res.status(400).json({ error: `Role must be one of: ${ALLOWED_ROLES.join(', ')}` });
    }

    // Verify user exists
    const [userRows] = await db.execute(
      sql`SELECT id, email, name FROM user WHERE id = ${targetUserId} LIMIT 1`
    ) as unknown as [Array<{ id: string; email: string; name: string | null }>, unknown];
    const targetUser = userRows?.[0];
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    // Must not already have a profile
    const existingProfile = await db.query.profiles.findFirst({ where: eq(profiles.userId, targetUserId) });
    if (existingProfile) {
      return res.status(400).json({ error: 'User already has a profile. Use change-role instead.' });
    }

    // Verify company exists
    const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
    if (!company) return res.status(404).json({ error: 'Company not found.' });

    // Create profile
    await db.insert(profiles).values({
      userId: targetUserId,
      companyId,
      role: role as AllowedRole,
      permJobs:          true,
      permFleet:         false,
      permForms:         true,
      permFiles:         true,
      permEstimating:    false,
      permDazzaAi:       false,
      permAdmin:         role === 'owner' || role === 'admin',
      permSeeDollars:    role === 'owner' || role === 'admin',
      permInviteUsers:   role === 'owner' || role === 'admin',
      permDeleteRecords: role === 'owner',
    });

    void logActivity({
      eventType: 'role_changed',
      success: true,
      userId: targetUserId,
      email: targetUser.email,
      companyId,
      performedByUserId: session.user.id,
      reason: `[orphan-assigned] ${reason?.trim() || 'Assigned to company by developer'}`,
      metadata: { action: 'assign_company', companyId, companyName: company.name, role },
    });

    console.log(`[developer] assign-company: target=${targetUser.email} → company=${company.name} (${companyId}) role=${role} by=${session.user.email}`);
    return res.json({ ok: true, companyId, companyName: company.name, role });
  } catch (err) {
    console.error('developer/users/assign-company error:', err);
    return res.status(500).json({ error: 'Failed to assign user to company.' });
  }
}
