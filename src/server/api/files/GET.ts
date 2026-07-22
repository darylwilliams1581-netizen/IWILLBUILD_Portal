import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { companyFiles, profiles, user } from '../../db/schema.js';
import { eq, desc, sql } from 'drizzle-orm';
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

    // Use raw SQL to LEFT JOIN jobs so we can get job name + number without
    // needing a Drizzle schema entry for the jobs table.
    const [rows] = await db.execute(sql.raw(`
      SELECT
        cf.id,
        cf.company_id AS companyId,
        cf.job_id AS jobId,
        cf.fleet_asset_id AS fleetAssetId,
        cf.uploaded_by_user_id AS uploadedByUserId,
        u.name AS uploaderName,
        cf.original_name AS originalName,
        cf.stored_name AS storedName,
        cf.mime_type AS mimeType,
        cf.size_bytes AS sizeBytes,
        cf.file_category AS fileCategory,
        cf.label,
        cf.notes,
        cf.created_at AS createdAt,
        j.name AS jobName,
        j.job_number AS jobNumber
      FROM company_files cf
      LEFT JOIN user u ON u.id = cf.uploaded_by_user_id
      LEFT JOIN jobs j ON j.id = cf.job_id
      WHERE cf.company_id = ${profile.companyId}
      ORDER BY cf.created_at DESC
    `)) as unknown as [Array<Record<string, unknown>>];

    res.json({ files: rows ?? [] });
  } catch (err) {
    console.error('GET /api/files error:', err);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
}
