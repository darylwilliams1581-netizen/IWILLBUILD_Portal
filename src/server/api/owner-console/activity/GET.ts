import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { user, userActivityEvents } from '../../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
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
    // Platform owner check handled by requirePlatformOwner middleware in entry.ts

    const limit = Math.min(Number(req.query.limit ?? 100), 500);

    const events = await db
      .select({
        id: userActivityEvents.id,
        userId: userActivityEvents.userId,
        companyId: userActivityEvents.companyId,
        eventType: userActivityEvents.eventType,
        metadataJson: userActivityEvents.metadataJson,
        createdAt: userActivityEvents.createdAt,
        userName: user.name,
        userEmail: user.email,
      })
      .from(userActivityEvents)
      .leftJoin(user, eq(userActivityEvents.userId, user.id))
      .orderBy(desc(userActivityEvents.createdAt))
      .limit(limit);

    res.json({ events });
  } catch (error) {
    console.error('GET /api/owner-console/activity error:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
}
