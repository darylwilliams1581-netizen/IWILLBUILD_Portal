/**
 * POST /api/plan-manager/drawings/:id/revisions/:revisionId/finalize
 * Locks a revision as final/official. Requires admin or owner role.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../../../db/schema.js';
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

    const drawingId  = parseInt(String(req.params.id), 10);
    const revisionId = parseInt(String(req.params.revisionId), 10);
    if (isNaN(drawingId) || isNaN(revisionId)) return res.status(400).json({ error: 'Invalid params' });

    // Verify ownership
    const [revRows] = await db.execute(sql`
      SELECT dr.id, dr.locked, pd.company_id
      FROM drawing_revisions dr
      JOIN project_drawings pd ON pd.id = dr.drawing_id
      WHERE dr.id = ${revisionId} AND dr.drawing_id = ${drawingId} AND pd.company_id = ${profile.companyId}
      LIMIT 1
    `) as unknown as [Array<{ id: number; locked: number; company_id: number }>];

    if (!revRows?.length) return res.status(404).json({ error: 'Revision not found' });
    if (revRows[0].locked) return res.status(409).json({ error: 'Already finalized' });

    await db.execute(sql`
      UPDATE drawing_revisions
      SET locked = 1, locked_at = NOW(), locked_by = ${session.user.id}, source_type = 'final'
      WHERE id = ${revisionId}
    `);

    await db.execute(sql`
      INSERT INTO drawing_audit_log (drawing_id, revision_id, actor_id, action, details_json)
      VALUES (${drawingId}, ${revisionId}, ${session.user.id}, 'finalized', '{}')
    `);

    res.json({ ok: true, locked: true });
  } catch (err) {
    console.error('POST finalize error:', err);
    res.status(500).json({ error: 'Failed to finalize revision' });
  }
}
