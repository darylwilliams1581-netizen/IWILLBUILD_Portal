/**
 * GET /api/plan-manager/jobs-with-drawings
 * Returns all jobs that have linked drawings, grouped with their drawings.
 * Also returns drawings with no job link under a synthetic "unassigned" group.
 * Query params: ?status=active|archived (default: active)
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

    const { status = 'active' } = req.query as Record<string, string>;
    const drawingStatus = status === 'archived' ? 'archived' : 'active';

    // Drawings linked to jobs
    const [linkedRows] = await db.execute(sql.raw(`
      SELECT
        j.id AS job_id,
        j.name AS job_name,
        j.job_number,
        j.status AS job_status,
        jdl.id AS link_id,
        jdl.sort_order AS link_sort_order,
        pd.id,
        pd.title,
        pd.description,
        pd.drawing_number,
        pd.discipline,
        pd.doc_status_label,
        pd.source_file_path,
        pd.source_file_name,
        pd.page_count,
        pd.current_revision_id,
        pd.status,
        pd.sort_order,
        pd.created_at,
        pd.updated_at,
        dr.revision_no,
        dr.name AS revision_name,
        dr.source_type,
        dr.locked,
        (SELECT COUNT(*) FROM drawing_annotations da WHERE da.drawing_id = pd.id) AS annotation_count
      FROM project_drawings pd
      JOIN job_drawing_links jdl ON jdl.drawing_id = pd.id
      JOIN jobs j ON j.id = jdl.job_id
      LEFT JOIN drawing_revisions dr ON dr.id = pd.current_revision_id
      WHERE pd.company_id = ${profile.companyId}
        AND j.company_id = ${profile.companyId}
        AND pd.status = '${drawingStatus}'
      ORDER BY j.name ASC, jdl.sort_order ASC, pd.sort_order ASC, pd.id ASC
    `)) as unknown as [Array<Record<string, unknown>>];

    // Drawings NOT linked to any job
    const [unlinkedRows] = await db.execute(sql.raw(`
      SELECT
        pd.id,
        pd.title,
        pd.description,
        pd.drawing_number,
        pd.discipline,
        pd.doc_status_label,
        pd.source_file_path,
        pd.source_file_name,
        pd.page_count,
        pd.current_revision_id,
        pd.status,
        pd.sort_order,
        pd.created_at,
        pd.updated_at,
        dr.revision_no,
        dr.name AS revision_name,
        dr.source_type,
        dr.locked,
        (SELECT COUNT(*) FROM drawing_annotations da WHERE da.drawing_id = pd.id) AS annotation_count
      FROM project_drawings pd
      LEFT JOIN drawing_revisions dr ON dr.id = pd.current_revision_id
      WHERE pd.company_id = ${profile.companyId}
        AND pd.status = '${drawingStatus}'
        AND pd.id NOT IN (
          SELECT drawing_id FROM job_drawing_links WHERE company_id = ${profile.companyId}
        )
      ORDER BY pd.sort_order ASC, pd.id ASC
    `)) as unknown as [Array<Record<string, unknown>>];

    // Group linked drawings by job
    const jobMap = new Map<number, {
      jobId: number;
      jobName: string;
      jobNumber: string;
      jobStatus: string;
      drawings: Array<Record<string, unknown>>;
    }>();

    for (const row of (linkedRows ?? [])) {
      const jobId = Number(row.job_id);
      if (!jobMap.has(jobId)) {
        jobMap.set(jobId, {
          jobId,
          jobName: String(row.job_name ?? ''),
          jobNumber: String(row.job_number ?? ''),
          jobStatus: String(row.job_status ?? ''),
          drawings: [],
        });
      }
      const { job_id, job_name, job_number, job_status, link_id, link_sort_order, ...drawing } = row;
      jobMap.get(jobId)!.drawings.push(drawing);
    }

    const jobs = Array.from(jobMap.values());
    const unassigned = unlinkedRows ?? [];

    res.json({ jobs, unassigned });
  } catch (err) {
    console.error('GET /api/plan-manager/jobs-with-drawings error:', err);
    res.status(500).json({ error: 'Failed to load drawings' });
  }
}
