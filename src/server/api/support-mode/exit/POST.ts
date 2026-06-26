import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles, supportAuditEvents } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { supportSessionStore } from '../../../support-session-store.js';

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

    const sessionToken = session.session.token;
    const ctx = supportSessionStore.get(sessionToken);

    if (ctx) {
      // Audit exit
      await db.insert(supportAuditEvents).values({
        ownerUserId: session.user.id,
        targetCompanyId: ctx.companyId,
        actionType: 'exit_support_mode',
        entityType: 'company',
        entityId: String(ctx.companyId),
        summary: `Owner exited support mode for company: ${ctx.companyName}`,
        metadataJson: null,
      });
      supportSessionStore.delete(sessionToken);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('POST /api/support-mode/exit error:', error);
    res.status(500).json({ error: 'Failed to exit support mode' });
  }
}
