/**
 * GET /api/developer/users/:id/sessions
 * Platform developer only — returns all active sessions for a user.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { session as sessionTable } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { PLATFORM_OWNER_EMAILS } from '../../../../../lib/platform-owner-guard.js';

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
    const sessions = await db
      .select({
        id: sessionTable.id,
        ipAddress: sessionTable.ipAddress,
        userAgent: sessionTable.userAgent,
        createdAt: sessionTable.createdAt,
        expiresAt: sessionTable.expiresAt,
      })
      .from(sessionTable)
      .where(eq(sessionTable.userId, targetUserId))
      .orderBy(sessionTable.createdAt);

    const now = new Date();
    const activeSessions = sessions
      .filter(s => s.expiresAt && new Date(s.expiresAt) > now)
      .map(s => ({
        id: s.id,
        ipAddress: s.ipAddress ?? 'Unknown',
        userAgent: s.userAgent ?? 'Unknown',
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      }));

    return res.json({ sessions: activeSessions, total: activeSessions.length });
  } catch (err) {
    console.error('developer/users/sessions GET error:', err);
    return res.status(500).json({ error: 'Failed to fetch sessions.' });
  }
}
