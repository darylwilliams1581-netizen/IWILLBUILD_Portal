/**
 * GET /api/plan-manager/drawings/:id
 * Returns drawing detail with current revision, all revisions, and job links.
 */
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

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const [drawingRows] = await db.execute(sql`
      SELECT pd.*, dr.revision_no, dr.name AS revision_name, dr.source_type, dr.locked, dr.locked_at
      FROM project_drawings pd
      LEFT JOIN drawing_revisions dr ON dr.id = pd.current_revision_id
      WHERE pd.id = ${id} AND pd.company_id = ${profile.companyId} AND pd.status != 'deleted'
      LIMIT 1
    `) as unknown as [Array<Record<string, unknown>>];

    if (!drawingRows?.length) return res.status(404).json({ error: 'Drawing not found' });

    const [revisions] = await db.execute(sql`
      SELECT id, revision_no, name, source_type, created_by, created_at, locked, locked_at, is_current
      FROM drawing_revisions WHERE drawing_id = ${id} ORDER BY revision_no DESC
    `) as unknown as [Array<Record<string, unknown>>];

    const [jobLinks] = await db.execute(sql`
      SELECT jdl.id, jdl.job_id, jdl.context_note, jdl.created_at,
             j.name AS job_name, j.job_number
      FROM job_drawing_links jdl
      JOIN jobs j ON j.id = jdl.job_id
      WHERE jdl.drawing_id = ${id}
    `) as unknown as [Array<Record<string, unknown>>];

    const [auditRows] = await db.execute(sql`
      SELECT id, actor_id, action, details_json, created_at
      FROM drawing_audit_log WHERE drawing_id = ${id}
      ORDER BY created_at DESC LIMIT 50
    `) as unknown as [Array<Record<string, unknown>>];

    res.json({
      drawing: drawingRows[0],
      revisions: revisions ?? [],
      jobLinks: jobLinks ?? [],
      auditLog: auditRows ?? [],
    });
  } catch (err) {
    console.error('GET /api/plan-manager/drawings/:id error:', err);
    res.status(500).json({ error: 'Failed to load drawing' });
  }
}
