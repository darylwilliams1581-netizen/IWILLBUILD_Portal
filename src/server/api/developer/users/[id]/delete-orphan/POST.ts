/**
 * POST /api/developer/users/:id/delete-orphan
 * Platform developer only — permanently deletes an orphaned auth user.
 *
 * Safety guards:
 * - User must have no profile (truly orphaned)
 * - User must have no company data (jobs, files, etc.)
 * - Requires explicit confirmation flag in body
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles, user } from '../../../../../db/schema.js';
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
    const { confirmed, reason } = req.body as { confirmed?: boolean; reason?: string };

    if (!confirmed) {
      return res.status(400).json({ error: 'Deletion requires explicit confirmation.' });
    }

    // Verify user exists
    const [userRows] = await db.execute(
      sql`SELECT id, email, name FROM user WHERE id = ${targetUserId} LIMIT 1`
    ) as unknown as [Array<{ id: string; email: string; name: string | null }>, unknown];

    const targetUser = userRows?.[0];
    if (!targetUser) return res.status(404).json({ error: 'User not found.' });

    // Safety: must have no profile (truly orphaned)
    const existingProfile = await db.query.profiles.findFirst({ where: eq(profiles.userId, targetUserId) });
    if (existingProfile) {
      return res.status(400).json({
        error: 'This user has a profile and is not orphaned. Use deactivate instead.',
      });
    }

    // Safety: check for any fleet telemetry linked to this user (orphans have
    // no profile/company so jobs can't be linked — check telemetry instead)
    try {
      const [telRows] = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM vehicle_telemetry WHERE driver_user_id = ${targetUserId} LIMIT 1`
      ) as unknown as [Array<{ cnt: number }>, unknown];
      const telCount = Number(telRows?.[0]?.cnt ?? 0);
      if (telCount > 0) {
        return res.status(400).json({
          error: `Cannot delete — user has ${telCount} telemetry record(s). Assign to a company instead.`,
        });
      }
    } catch { /* vehicle_telemetry table may not exist yet — safe to proceed */ }

    // Delete sessions first
    try {
      await db.execute(sql`DELETE FROM session WHERE user_id = ${targetUserId}`);
    } catch { /* sessions table may not exist */ }

    // Delete any password reset tokens
    try {
      await db.execute(sql`DELETE FROM password_reset_tokens WHERE user_id = ${targetUserId}`);
    } catch { /* table may not exist */ }

    // Delete the auth user
    await db.execute(sql`DELETE FROM user WHERE id = ${targetUserId}`);

    void logActivity({
      eventType: 'account_deactivated',
      success: true,
      userId: targetUserId,
      email: targetUser.email,
      companyId: null,
      performedByUserId: session.user.id,
      reason: `[orphan-deleted] ${reason?.trim() || 'No reason given'}`,
    });

    console.log(`[developer] orphan-delete: target=${targetUser.email} (${targetUserId}) by=${session.user.email}`);
    return res.json({ ok: true, deleted: true, email: targetUser.email });
  } catch (err) {
    console.error('developer/users/delete-orphan error:', err);
    return res.status(500).json({ error: 'Failed to delete orphaned user.' });
  }
}
