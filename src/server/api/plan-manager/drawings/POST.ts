/**
 * POST /api/plan-manager/drawings
 * Create a new drawing record (metadata only; upload separately).
 * Body: { title, description?, projectId?, drawingNumber?, discipline?, docStatusLabel?, revisionName? }
 *
 * drawingNumber   — e.g. "A-001"
 * discipline      — e.g. "Architectural", "Structural", "Services"
 * docStatusLabel  — e.g. "For Construction", "For Review", "Issued for Tender"
 * revisionName    — overrides the default "Draft" label on the initial revision
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
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

    const {
      title,
      description,
      projectId,
      drawingNumber,
      discipline,
      docStatusLabel,
      revisionName,
    } = req.body as {
      title?: string;
      description?: string;
      projectId?: number | null;
      drawingNumber?: string;
      discipline?: string;
      docStatusLabel?: string;
      revisionName?: string;
    };

    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    const safeRevisionName = revisionName?.trim() || 'Draft';

    const [result] = await db.execute(sql`
      INSERT INTO project_drawings
        (company_id, project_id, name, title, description, status,
         drawing_number, discipline, doc_status_label, created_by)
      VALUES
        (${profile.companyId}, ${projectId ?? null}, ${title.trim()}, ${title.trim()},
         ${description?.trim() ?? null}, 'active',
         ${drawingNumber?.trim() ?? null}, ${discipline?.trim() ?? null},
         ${docStatusLabel?.trim() ?? null}, ${session.user.id})
    `) as unknown as [{ insertId: number }];

    const drawingId = (result as unknown as { insertId: number }).insertId;

    // Create initial draft revision (name overridable via revisionName)
    const [revResult] = await db.execute(sql`
      INSERT INTO drawing_revisions (drawing_id, revision_no, name, source_type, created_by, is_current)
      VALUES (${drawingId}, 1, ${safeRevisionName}, 'draft', ${session.user.id}, 1)
    `) as unknown as [{ insertId: number }];

    const revisionId = (revResult as unknown as { insertId: number }).insertId;

    await db.execute(sql`
      UPDATE project_drawings SET current_revision_id = ${revisionId} WHERE id = ${drawingId}
    `);

    await db.execute(sql`
      INSERT INTO drawing_audit_log (drawing_id, revision_id, actor_id, action, details_json)
      VALUES (${drawingId}, ${revisionId}, ${session.user.id}, 'created',
              ${JSON.stringify({
                title: title.trim(),
                drawingNumber: drawingNumber?.trim() ?? null,
                discipline: discipline?.trim() ?? null,
                docStatusLabel: docStatusLabel?.trim() ?? null,
                revisionName: safeRevisionName,
              })})
    `);

    res.status(201).json({ id: drawingId, revisionId });
  } catch (err) {
    console.error('POST /api/plan-manager/drawings error:', err);
    res.status(500).json({ error: 'Failed to create drawing' });
  }
}
