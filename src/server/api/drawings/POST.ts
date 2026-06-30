/**
 * POST /api/drawings
 * Creates a drawing_record row linking an already-uploaded file to the register.
 * The file must have been uploaded first via POST /api/drawings/upload.
 *
 * Body: { jobId, fileId, drawingNumber, title, revision, discipline, status }
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import type { ResultSetHeader } from 'mysql2';

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

    const { jobId, fileId, drawingNumber, title, revision, discipline, status } = req.body as {
      jobId?: number;
      fileId?: number;
      drawingNumber?: string;
      title?: string;
      revision?: string;
      discipline?: string;
      status?: string;
    };

    if (!jobId || !fileId || !title) {
      return res.status(400).json({ error: 'jobId, fileId and title are required' });
    }

    const DISCIPLINES = ['Architectural', 'Structural', 'Civil', 'Mechanical', 'Electrical', 'Hydraulic', 'Landscape', 'Survey', 'Other'];
    const STATUSES = ['For Construction', 'For Review', 'Preliminary', 'As Built', 'Superseded', 'Void'];

    const disc = DISCIPLINES.includes(discipline ?? '') ? discipline : 'Other';
    const stat = STATUSES.includes(status ?? '') ? status : 'For Construction';

    const [result] = await db.execute(sql`
      INSERT INTO drawing_records
        (company_id, job_id, file_id, drawing_number, title, revision, discipline, status, original_file_id, uploaded_by_user_id, created_at, updated_at)
      VALUES
        (${profile.companyId}, ${jobId}, ${fileId}, ${drawingNumber?.trim() || null}, ${title.trim()}, ${revision?.trim() || 'A'}, ${disc}, ${stat}, ${fileId}, ${session.user.id}, NOW(), NOW())
    `) as unknown as [ResultSetHeader, unknown];

    const insertId = (result as ResultSetHeader).insertId;

    const [rows] = await db.execute(sql`
      SELECT dr.*, u.name AS uploaded_by_name, f.original_name AS file_name, f.mime_type AS file_mime, f.stored_name AS file_stored_name
      FROM drawing_records dr
      LEFT JOIN \`user\` u ON u.id = dr.uploaded_by_user_id
      LEFT JOIN company_files f ON f.id = dr.file_id
      WHERE dr.id = ${insertId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ drawing: rows[0] });
  } catch (err) {
    console.error('POST /api/drawings error:', err);
    res.status(500).json({ error: 'Failed to create drawing record' });
  }
}
