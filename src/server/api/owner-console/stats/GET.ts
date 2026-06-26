import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const callerProfile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (callerProfile?.role !== 'owner') {
      return res.status(403).json({ error: 'Owner access required' });
    }

    const [totalCompanies] = await db.execute(sql`SELECT COUNT(*) as cnt FROM companies`);
    const [totalUsers] = await db.execute(sql`SELECT COUNT(*) as cnt FROM profiles`);
    const [activeUsers] = await db.execute(sql`SELECT COUNT(*) as cnt FROM profiles WHERE status = 'active'`);
    const [invitedUsers] = await db.execute(sql`SELECT COUNT(*) as cnt FROM profiles WHERE status = 'invited'`);
    const [inactiveUsers] = await db.execute(sql`SELECT COUNT(*) as cnt FROM profiles WHERE status = 'inactive'`);

    // Online now: last_active_at within 5 minutes
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const [onlineNow] = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM profiles WHERE last_active_at >= ${fiveMinAgo}`
    );

    // Logins today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [loginsToday] = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM user_activity_events WHERE event_type = 'login' AND created_at >= ${todayStart}`
    );

    const get = (r: unknown) => Number((r as Array<{ cnt: number }>)[0]?.cnt ?? 0);

    res.json({
      totalCompanies: get(totalCompanies),
      totalUsers: get(totalUsers),
      activeUsers: get(activeUsers),
      invitedUsers: get(invitedUsers),
      inactiveUsers: get(inactiveUsers),
      onlineNow: get(onlineNow),
      loginsToday: get(loginsToday),
    });
  } catch (error) {
    console.error('GET /api/owner-console/stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
}
