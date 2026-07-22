/**
 * GET /api/plan-manager/drawings
 * List all drawings for the company. Optional ?status=active|archived
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

    const { status = 'active', jobId } = req.query as Record<string, string>;

    let query: string;
    if (jobId) {
      query = `
        SELECT pd.*, dr.revision_no, dr.name AS revision_name, dr.source_type, dr.locked,
               (SELECT COUNT(*) FROM drawing_annotations da WHERE da.drawing_id = pd.id) AS annotation_count
        FROM project_drawings pd
        JOIN job_drawing_links jdl ON jdl.drawing_id = pd.id
        LEFT JOIN drawing_revisions dr ON dr.id = pd.current_revision_id
        WHERE pd.company_id = ${profile.companyId} AND jdl.job_id = ${parseInt(jobId, 10)}
          AND pd.status != 'deleted'
        ORDER BY pd.updated_at DESC
      `;
    } else {
      query = `
        SELECT pd.*, dr.revision_no, dr.name AS revision_name, dr.source_type, dr.locked,
               (SELECT COUNT(*) FROM drawing_annotations da WHERE da.drawing_id = pd.id) AS annotation_count
        FROM project_drawings pd
        LEFT JOIN drawing_revisions dr ON dr.id = pd.current_revision_id
        WHERE pd.company_id = ${profile.companyId} AND pd.status = '${status === 'archived' ? 'archived' : 'active'}'
        ORDER BY pd.updated_at DESC
      `;
    }

    const [rows] = await db.execute(sql.raw(query)) as unknown as [Array<Record<string, unknown>>];
    res.json({ drawings: rows ?? [] });
  } catch (err) {
    console.error('GET /api/plan-manager/drawings error:', err);
    res.status(500).json({ error: 'Failed to load drawings' });
  }
}
