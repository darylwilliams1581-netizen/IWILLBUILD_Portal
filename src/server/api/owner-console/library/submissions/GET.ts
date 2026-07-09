/**
 * GET /api/owner-console/library/submissions
 * Platform owner only.
 * Returns all library_items with visibility='pending' for review.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  try {
    const [rows] = await db.execute(sql.raw(
      `SELECT
         li.id, li.title, li.type, li.category, li.discipline, li.summary,
         li.visibility, li.status, li.version,
         li.submitted_by_company_id, li.submitted_by_user_id,
         li.reviewer_notes, li.reviewed_at, li.reviewed_by,
         li.created_at, li.updated_at,
         c.name AS company_name,
         u.name AS submitter_name, u.email AS submitter_email
       FROM library_items li
       LEFT JOIN companies c ON c.id = li.submitted_by_company_id
       LEFT JOIN user u ON u.id = li.submitted_by_user_id
       WHERE li.visibility IN ('pending', 'rejected')
          OR (li.visibility = 'public' AND li.submitted_by_company_id IS NOT NULL)
       ORDER BY
         CASE li.visibility WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END,
         li.created_at DESC
       LIMIT 200`
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
      submitted_by_company_id: number | null;
      submitted_by_user_id: string | null;
      reviewer_notes: string | null;
      reviewed_at: string | null;
      reviewed_by: string | null;
      created_at: string;
      updated_at: string;
      company_name: string | null;
      submitter_name: string | null;
      submitter_email: string | null;
    }>, unknown];

    return res.json({ submissions: rows ?? [] });
  } catch (err) {
    console.error('owner submissions error:', err);
    return res.status(500).json({ error: 'Failed to load submissions' });
  }
}
