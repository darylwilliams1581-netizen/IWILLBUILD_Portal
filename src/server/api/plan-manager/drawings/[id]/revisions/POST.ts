/**
 * POST /api/plan-manager/drawings/:id/revisions
 * Save as New Revision — copies annotations from current revision into a new one.
 * Body: { name? }
 */
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

    const drawingId = parseInt(String(req.params.id), 10);
    if (isNaN(drawingId)) return res.status(400).json({ error: 'Invalid ID' });

    const { name } = req.body as { name?: string };

    // Get current revision
    const [drawingRows] = await db.execute(sql`
      SELECT id, current_revision_id FROM project_drawings
      WHERE id = ${drawingId} AND company_id = ${profile.companyId} AND status != 'deleted'
      LIMIT 1
    `) as unknown as [Array<{ id: number; current_revision_id: number }>];
    if (!drawingRows?.length) return res.status(404).json({ error: 'Drawing not found' });

    const currentRevId = drawingRows[0].current_revision_id;

    // Get next revision number
    const [maxRevRows] = await db.execute(sql`
      SELECT MAX(revision_no) AS max_rev FROM drawing_revisions WHERE drawing_id = ${drawingId}
    `) as unknown as [Array<{ max_rev: number | null }>];
    const nextRevNo = (maxRevRows?.[0]?.max_rev ?? 0) + 1;

    // Mark all existing revisions as not current
    await db.execute(sql`
      UPDATE drawing_revisions SET is_current = 0 WHERE drawing_id = ${drawingId}
    `);

    // Create new revision
    const revName = name?.trim() || `Revision ${nextRevNo}`;
    const [revResult] = await db.execute(sql`
      INSERT INTO drawing_revisions (drawing_id, revision_no, name, source_type, created_by, is_current)
      VALUES (${drawingId}, ${nextRevNo}, ${revName}, 'revision', ${session.user.id}, 1)
    `) as unknown as [{ insertId: number }];
    const newRevId = (revResult as unknown as { insertId: number }).insertId;

    // Copy annotations from previous revision
    await db.execute(sql`
      INSERT INTO drawing_annotations (revision_id, drawing_id, sheet_id, page_no, type, geometry_json, style_json, label, author_id)
      SELECT ${newRevId}, drawing_id, sheet_id, page_no, type, geometry_json, style_json, label, author_id
      FROM drawing_annotations WHERE revision_id = ${currentRevId}
    `);

    // Update drawing current_revision_id
    await db.execute(sql`
      UPDATE project_drawings SET current_revision_id = ${newRevId}, updated_at = NOW() WHERE id = ${drawingId}
    `);

    await db.execute(sql`
      INSERT INTO drawing_audit_log (drawing_id, revision_id, actor_id, action, details_json)
      VALUES (${drawingId}, ${newRevId}, ${session.user.id}, 'new_revision',
              ${JSON.stringify({ revisionNo: nextRevNo, name: revName, fromRevisionId: currentRevId })})
    `);

    res.status(201).json({ revisionId: newRevId, revisionNo: nextRevNo, name: revName });
  } catch (err) {
    console.error('POST revisions error:', err);
    res.status(500).json({ error: 'Failed to create revision' });
  }
}
