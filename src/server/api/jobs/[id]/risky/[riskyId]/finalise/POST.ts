import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../../db/schema.js';
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

    const riskyId = parseInt(req.params.riskyId, 10);

    const [rows] = await db.execute(sql`
      SELECT * FROM risky_assessments WHERE id = ${riskyId} AND company_id = ${profile.companyId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];
    const record = (rows ?? [])[0];
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (record.status === 'finalised') return res.status(400).json({ error: 'Already finalised' });

    // Validate required fields
    if (!record.activity) return res.status(400).json({ error: 'Activity/task is required' });
    const hazards = typeof record.hazards_selected === 'string'
      ? JSON.parse(record.hazards_selected)
      : (record.hazards_selected ?? []);
    if (!Array.isArray(hazards) || hazards.length === 0) {
      return res.status(400).json({ error: 'At least one hazard must be selected' });
    }
    if (!record.control_measures) return res.status(400).json({ error: 'Control measures are required' });
    if (!record.workers_briefed) return res.status(400).json({ error: 'Workers must be confirmed as briefed' });

    // Check at least one signature
    const [sigRows] = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM risky_assessment_signatures WHERE risky_assessment_id = ${riskyId}
    `) as unknown as [Array<{ cnt: number }>, unknown];
    if (Number((sigRows ?? [])[0]?.cnt ?? 0) === 0) {
      return res.status(400).json({ error: 'At least one party must sign before finalising' });
    }

    await db.execute(sql`
      UPDATE risky_assessments SET status = 'finalised', finalised_at = NOW(), updated_at = NOW()
      WHERE id = ${riskyId} AND company_id = ${profile.companyId}
    `);

    res.json({ ok: true });
  } catch (err) {
    console.error('POST finalise risky error:', err);
    res.status(500).json({ error: 'Failed to finalise risky assessment' });
  }
}
