/**
 * GET /api/plan-manager/drawings/:id/pages/:pageNo/annotations
 * Returns annotations for a specific page of the current (or specified) revision.
 * Query: ?revisionId= (optional, defaults to current)
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

    const drawingId = parseInt(String(req.params.id), 10);
    const pageNo    = parseInt(String(req.params.pageNo), 10);
    if (isNaN(drawingId) || isNaN(pageNo)) return res.status(400).json({ error: 'Invalid params' });

    // Resolve revision
    let revisionId: number;
    if (req.query.revisionId) {
      revisionId = parseInt(String(req.query.revisionId), 10);
    } else {
      const [revRows] = await db.execute(sql`
        SELECT current_revision_id FROM project_drawings
        WHERE id = ${drawingId} AND company_id = ${profile.companyId} LIMIT 1
      `) as unknown as [Array<{ current_revision_id: number }>];
      if (!revRows?.length) return res.status(404).json({ error: 'Drawing not found' });
      revisionId = revRows[0].current_revision_id;
    }

    const [rows] = await db.execute(sql`
      SELECT id, type, geometry_json, style_json, label, author_id, created_at, updated_at, is_locked, page_no
      FROM drawing_annotations
      WHERE revision_id = ${revisionId} AND drawing_id = ${drawingId} AND page_no = ${pageNo}
      ORDER BY created_at ASC
    `) as unknown as [Array<Record<string, unknown>>];

    res.json({ annotations: rows ?? [], revisionId, pageNo });
  } catch (err) {
    console.error('GET annotations error:', err);
    res.status(500).json({ error: 'Failed to load annotations' });
  }
}
