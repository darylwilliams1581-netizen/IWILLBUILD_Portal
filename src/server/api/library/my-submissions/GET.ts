/**
 * GET /api/library/my-submissions
 *
 * Returns library_items submitted by the current user's company,
 * ordered newest first. Includes pending, public, and rejected items.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const companyId = auth.profile.company_id;
  if (!companyId) return res.json({ submissions: [] });

  try {
    const [rows] = await db.execute(sql.raw(
      `SELECT
         id, title, type, category, discipline, summary,
         visibility, status, version,
         reviewer_notes, reviewed_at,
         created_at, updated_at
       FROM library_items
       WHERE submitted_by_company_id = ${companyId}
       ORDER BY created_at DESC
       LIMIT 100`
    )) as unknown as [Array<{
      id: number;
      title: string;
      type: string;
      category: string | null;
      discipline: string | null;
      summary: string | null;
      visibility: string;
      status: string;
      version: string;
      reviewer_notes: string | null;
      reviewed_at: string | null;
      created_at: string;
      updated_at: string;
    }>, unknown];

    return res.json({ submissions: rows ?? [] });
  } catch (err) {
    console.error('my-submissions error:', err);
    return res.status(500).json({ error: 'Failed to load submissions' });
  }
}
