import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles, supportAuditEvents, user } from '../../../db/schema.js';
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

    const callerProfile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (callerProfile?.role !== 'owner') {
      return res.status(403).json({ error: 'Owner access required' });
    }

    const companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
    const limit = Math.min(Number(req.query.limit ?? 200), 500);

    const events = await db
      .select({
        id: supportAuditEvents.id,
        ownerUserId: supportAuditEvents.ownerUserId,
        targetCompanyId: supportAuditEvents.targetCompanyId,
        actionType: supportAuditEvents.actionType,
        entityType: supportAuditEvents.entityType,
        entityId: supportAuditEvents.entityId,
        summary: supportAuditEvents.summary,
        metadataJson: supportAuditEvents.metadataJson,
        createdAt: supportAuditEvents.createdAt,
        ownerName: user.name,
        ownerEmail: user.email,
      })
      .from(supportAuditEvents)
      .leftJoin(user, eq(supportAuditEvents.ownerUserId, user.id))
      .orderBy(desc(supportAuditEvents.createdAt))
      .limit(limit);

    const filtered = companyId
      ? events.filter((e) => e.targetCompanyId === companyId)
      : events;

    res.json({ events: filtered });
  } catch (error) {
    console.error('GET /api/support-mode/audit error:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
}
