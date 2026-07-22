import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
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

    const [check] = await db.execute(sql`
      SELECT id FROM incidents WHERE id = ${incidentId} AND company_id = ${profile.companyId}
    `) as unknown as [Array<{ id: number }>, unknown];
    if (!(check ?? [])[0]) return res.status(404).json({ error: 'Not found' });

    const { action, owner, dueDate, notes } = req.body as Record<string, unknown>;
    if (!action) return res.status(400).json({ error: 'Action is required' });

    const [result] = await db.execute(sql`
      INSERT INTO incident_corrective_actions (incident_id, action, owner, due_date, notes, status)
      VALUES (${incidentId}, ${action}, ${owner ?? null}, ${dueDate ?? null}, ${notes ?? null}, 'open')
    `) as unknown as [{ insertId: number }, unknown];

    res.status(201).json({ id: (result as { insertId: number }).insertId });
  } catch (err) {
    console.error('POST corrective action error:', err);
    res.status(500).json({ error: 'Failed to create corrective action' });
  }
}
