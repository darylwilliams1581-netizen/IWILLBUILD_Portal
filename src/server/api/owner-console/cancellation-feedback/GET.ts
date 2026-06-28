/**
 * GET /api/owner-console/cancellation-feedback
 * Returns all cancellation feedback rows for the Owner Console.
 * Owner-only.
 */
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

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (profile?.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

    const [rows] = await db.execute(sql`
      SELECT
        f.id,
        COALESCE(c.name, 'Unknown Company') AS companyName,
        f.plan,
        f.reason,
        f.comment,
        f.created_at AS createdAt
      FROM subscription_cancellation_feedback f
      LEFT JOIN companies c ON c.id = f.company_id
      ORDER BY f.created_at DESC
      LIMIT 500
    `) as unknown as [Array<{
      id: number;
      companyName: string;
      plan: string;
      reason: string | null;
      comment: string | null;
      createdAt: string;
    }>, unknown];

    res.json(rows);
  } catch (error) {
    console.error('owner-console/cancellation-feedback error:', error);
    res.status(500).json({ error: String(error) });
  }
}
