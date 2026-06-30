/**
 * GET /api/drawings?jobId=:jobId
 * Returns the drawing register for a job (all drawing_records rows).
 * Auth required.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

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

    const jobId = req.query.jobId ? parseInt(req.query.jobId as string, 10) : null;
    if (!jobId) return res.status(400).json({ error: 'jobId is required' });

    const [rows] = await db.execute(sql`
      SELECT
        dr.*,
        u.name AS uploaded_by_name,
        f.original_name AS file_name,
        f.mime_type AS file_mime,
        f.size_bytes AS file_size,
        f.stored_name AS file_stored_name,
        mf.original_name AS markup_file_name,
        mf.stored_name AS markup_stored_name
      FROM drawing_records dr
      LEFT JOIN \`user\` u ON u.id = dr.uploaded_by_user_id
      LEFT JOIN company_files f ON f.id = dr.file_id
      LEFT JOIN company_files mf ON mf.id = dr.marked_up_file_id
      WHERE dr.company_id = ${profile.companyId}
        AND dr.job_id = ${jobId}
      ORDER BY dr.discipline ASC, dr.drawing_number ASC, dr.created_at DESC
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ drawings: rows });
  } catch (err) {
    console.error('GET /api/drawings error:', err);
    res.status(500).json({ error: 'Failed to load drawings' });
  }
}
