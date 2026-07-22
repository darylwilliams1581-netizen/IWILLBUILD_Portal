/**
 * GET /api/developer/company-health
 * Platform developer only — health summary for all companies (or one).
 * Query: ?companyId=xxx (optional)
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { PLATFORM_OWNER_EMAILS } from '../../../lib/platform-owner-guard.js';

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

    const companyIdFilter = req.query.companyId ? Number(req.query.companyId) : null;

    type HealthRow = {
      company_id: number;
      company_name: string;
      plan: string;
      subscription_status: string;
      created_at: string;
      total_users: number;
      active_users: number;
      inactive_users: number;
      unverified_users: number;
      invited_users: number;
      job_count: number;
      last_login_at: string | null;
      starter_pack_loaded: number;
      open_support_notes: number;
    };

    const [rows] = await db.execute(sql`
      SELECT
        c.id AS company_id,
        c.name AS company_name,
        c.plan,
        c.subscription_status,
        c.created_at,
        COUNT(p.id) AS total_users,
        SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END) AS active_users,
        SUM(CASE WHEN p.status = 'inactive' THEN 1 ELSE 0 END) AS inactive_users,
        SUM(CASE WHEN u.email_verified = 0 AND p.status != 'inactive' THEN 1 ELSE 0 END) AS unverified_users,
        SUM(CASE WHEN p.status = 'invited' THEN 1 ELSE 0 END) AS invited_users,
        (SELECT COUNT(*) FROM jobs j WHERE j.company_id = c.id) AS job_count,
        (SELECT MAX(p2.last_login_at) FROM profiles p2 WHERE p2.company_id = c.id) AS last_login_at,
        COALESCE(c.starter_pack_loaded, 0) AS starter_pack_loaded,
        (SELECT COUNT(*) FROM developer_support_notes sn WHERE sn.company_id = c.id) AS open_support_notes
      FROM companies c
      LEFT JOIN profiles p ON p.company_id = c.id
      LEFT JOIN user u ON u.id = p.user_id
      WHERE (${companyIdFilter} IS NULL OR c.id = ${companyIdFilter})
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT 200
    `) as unknown as [HealthRow[], unknown];

    return res.json({ companies: rows ?? [] });
  } catch (err) {
    console.error('developer/company-health GET error:', err);
    return res.status(500).json({ error: 'Failed to fetch company health.' });
  }
}
