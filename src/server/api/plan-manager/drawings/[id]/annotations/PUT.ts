/**
 * PUT /api/plan-manager/drawings/:id/annotations
 * Bulk-save annotations for a page in the current draft revision.
 * Body: { pageNo, revisionId, annotations: AnnotationPayload[] }
 * Replaces all annotations for that page in the revision (full replace strategy).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';

interface AnnotationPayload {
  id?: number;
  type: string;
  geometry_json: string;
  style_json?: string;
  label?: string;
  page_no?: number;
}

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

    const { pageNo, revisionId, annotations } = req.body as {
      pageNo: number;
      revisionId: number;
      annotations: AnnotationPayload[];
    };

    if (!pageNo || !revisionId) return res.status(400).json({ error: 'pageNo and revisionId required' });

    // Verify revision belongs to this drawing and is not locked
    const [revRows] = await db.execute(sql`
      SELECT dr.id, dr.locked, pd.company_id
      FROM drawing_revisions dr
      JOIN project_drawings pd ON pd.id = dr.drawing_id
      WHERE dr.id = ${revisionId} AND dr.drawing_id = ${drawingId} AND pd.company_id = ${profile.companyId}
      LIMIT 1
    `) as unknown as [Array<{ id: number; locked: number; company_id: number }>];

    if (!revRows?.length) return res.status(404).json({ error: 'Revision not found' });
    if (revRows[0].locked) return res.status(409).json({ error: 'Revision is locked and cannot be edited' });

    // Delete existing annotations for this page in this revision
    await db.execute(sql`
      DELETE FROM drawing_annotations
      WHERE revision_id = ${revisionId} AND drawing_id = ${drawingId} AND page_no = ${pageNo}
    `);

    // Insert new annotations
    if (annotations?.length) {
      for (const ann of annotations) {
        await db.execute(sql`
          INSERT INTO drawing_annotations
            (revision_id, drawing_id, page_no, type, geometry_json, style_json, label, author_id)
          VALUES
            (${revisionId}, ${drawingId}, ${pageNo}, ${ann.type},
             ${typeof ann.geometry_json === 'string' ? ann.geometry_json : JSON.stringify(ann.geometry_json)},
             ${ann.style_json ? (typeof ann.style_json === 'string' ? ann.style_json : JSON.stringify(ann.style_json)) : null},
             ${ann.label ?? null}, ${session.user.id})
        `);
      }
    }

    // Update drawing updated_at
    await db.execute(sql`UPDATE project_drawings SET updated_at = NOW() WHERE id = ${drawingId}`);

    await db.execute(sql`
      INSERT INTO drawing_audit_log (drawing_id, revision_id, actor_id, action, details_json)
      VALUES (${drawingId}, ${revisionId}, ${session.user.id}, 'annotations_saved',
              ${JSON.stringify({ pageNo, count: annotations?.length ?? 0 })})
    `);

    res.json({ ok: true, saved: annotations?.length ?? 0 });
  } catch (err) {
    console.error('PUT annotations error:', err);
    res.status(500).json({ error: 'Failed to save annotations' });
  }
}
