/**
 * GET /api/developer/audit-log
 * Platform developer only — returns the developer action audit log.
 * Query params: limit (default 100), offset (default 0), targetUserId, actionType
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { PLATFORM_OWNER_EMAILS } from '../../../lib/platform-owner-guard.js';
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

export default async function handler(req: Request, res: Response) {
  try {
    const session = await getDevSession(req);
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });
    if (!await isPlatformDev(session.user.id, session.user.email ?? '')) {
      return res.status(403).json({ error: 'Platform developer access required.' });
    }

    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const offset = Number(req.query.offset ?? 0);
    const targetUserId = req.query.targetUserId as string | undefined;
    const actionType = req.query.actionType as string | undefined;

    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [];
    if (targetUserId) { whereClause += ' AND target_user_id = ?'; params.push(targetUserId); }
    if (actionType) { whereClause += ' AND action_type = ?'; params.push(actionType); }

    const [rows] = await db.execute(
      sql.raw(`SELECT * FROM developer_audit_log ${whereClause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`)
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({ events: rows ?? [] });
  } catch (err) {
    console.error('developer/audit-log error:', err);
    return res.status(500).json({ error: 'Failed to fetch audit log.' });
  }
}
