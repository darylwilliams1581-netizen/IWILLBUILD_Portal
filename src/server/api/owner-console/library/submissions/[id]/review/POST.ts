/**
 * POST /api/owner-console/library/submissions/:id/review
 * Platform owner only.
 *
 * Approve or reject a pending library submission.
 *
 * Body:
 *   action  — 'approve' | 'reject'
 *   notes   — optional reviewer notes (shown to submitter)
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  const { action, notes } = req.body as { action?: string; notes?: string };
  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json({ error: 'action must be approve or reject' });
  }

  const visibility = action === 'approve' ? 'public'   : 'rejected';
  const status     = action === 'approve' ? 'active'   : 'draft';
  const notesVal   = (notes ?? '').trim() || null;
  const reviewerId = auth.session.user.id;

  try {
    await db.execute(sql.raw(
      `UPDATE library_items
       SET visibility = ${JSON.stringify(visibility)},
           status     = ${JSON.stringify(status)},
           reviewer_notes = ${notesVal ? JSON.stringify(notesVal) : 'NULL'},
           reviewed_at    = NOW(),
           reviewed_by    = ${JSON.stringify(reviewerId)},
           updated_at     = NOW()
       WHERE id = ${id}`
    ));

    return res.json({ ok: true, action, visibility });
  } catch (err) {
    console.error('review submission error:', err);
    return res.status(500).json({ error: 'Failed to review submission' });
  }
}
