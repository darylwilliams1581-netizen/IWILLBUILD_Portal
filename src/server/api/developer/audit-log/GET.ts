/**
 * GET /api/developer/audit-log
 * Platform developer only — returns the developer action audit log.
 *
 * Query params:
 *   limit        (default 100, max 500)
 *   offset       (default 0)
 *   targetUserId filter by target_user_id
 *   actionType   filter by action_type
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

    const limit  = Math.min(Number(req.query.limit  ?? 100), 500);
    const offset = Number(req.query.offset ?? 0);
    const targetUserId = (req.query.targetUserId as string | undefined)?.trim() || null;
    const actionType   = (req.query.actionType   as string | undefined)?.trim() || null;

    // Build query using Drizzle sql template tag for safe parameterisation
    let countQuery = sql`SELECT COUNT(*) as total FROM developer_audit_log WHERE 1=1`;
    let dataQuery  = sql`SELECT * FROM developer_audit_log WHERE 1=1`;

    if (targetUserId) {
      countQuery = sql`${countQuery} AND target_user_id = ${targetUserId}`;
      dataQuery  = sql`${dataQuery}  AND target_user_id = ${targetUserId}`;
    }
    if (actionType) {
      countQuery = sql`${countQuery} AND action_type = ${actionType}`;
      dataQuery  = sql`${dataQuery}  AND action_type = ${actionType}`;
    }

    dataQuery = sql`${dataQuery} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const [countRows] = await db.execute(countQuery) as unknown as [Array<{ total: number }>, unknown];
    const [rows]      = await db.execute(dataQuery)  as unknown as [Array<Record<string, unknown>>, unknown];

    const total = Number(countRows?.[0]?.total ?? 0);

    return res.json({ events: rows ?? [], total, limit, offset });
  } catch (err) {
    console.error('developer/audit-log error:', err);
    return res.status(500).json({ error: 'Failed to fetch audit log.' });
  }
}
