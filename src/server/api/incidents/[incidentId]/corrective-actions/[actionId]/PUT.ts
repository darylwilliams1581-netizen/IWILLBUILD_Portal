import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const incidentId = parseInt(req.params.incidentId, 10);
    const actionId = parseInt(req.params.actionId, 10);

    const { action, owner, dueDate, status, notes } = req.body as Record<string, unknown>;

    const completedAt = status === 'complete' ? sql`NOW()` : sql`NULL`;

    await db.execute(sql`
      UPDATE incident_corrective_actions ca
      INNER JOIN incidents i ON i.id = ca.incident_id AND i.company_id = ${profile.companyId}
      SET
        ca.action       = ${action ?? null},
        ca.owner        = ${owner ?? null},
        ca.due_date     = ${dueDate ?? null},
        ca.status       = ${status ?? 'open'},
        ca.completed_at = ${completedAt},
        ca.notes        = ${notes ?? null},
        ca.updated_at   = NOW()
      WHERE ca.id = ${actionId} AND ca.incident_id = ${incidentId}
    `);

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT corrective action error:', err);
    res.status(500).json({ error: 'Failed to update corrective action' });
  }
}
