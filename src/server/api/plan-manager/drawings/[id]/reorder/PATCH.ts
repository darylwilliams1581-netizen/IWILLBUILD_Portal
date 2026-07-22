/**
 * PATCH /api/plan-manager/drawings/:id/reorder
 * Move a drawing up or down within its job context (or globally if no jobId).
 * Body: { direction: 'up' | 'down', jobId?: number }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
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

    const drawingId = parseInt(req.params.id, 10);
    const { direction, jobId } = req.body as { direction: 'up' | 'down'; jobId?: number };

    if (!direction || !['up', 'down'].includes(direction)) {
      return res.status(400).json({ error: 'direction must be up or down' });
    }

    if (jobId) {
      // Reorder within a job's drawing list (job_drawing_links.sort_order)
      const [siblings] = await db.execute(sql.raw(`
        SELECT jdl.id AS link_id, jdl.drawing_id, jdl.sort_order
        FROM job_drawing_links jdl
        JOIN project_drawings pd ON pd.id = jdl.drawing_id
        WHERE jdl.job_id = ${jobId} AND jdl.company_id = ${profile.companyId}
          AND pd.status != 'deleted'
        ORDER BY jdl.sort_order ASC, jdl.id ASC
      `)) as unknown as [Array<{ link_id: number; drawing_id: number; sort_order: number }>];

      const rows = siblings ?? [];
      const idx = rows.findIndex(r => Number(r.drawing_id) === drawingId);
      if (idx === -1) return res.status(404).json({ error: 'Drawing not found in job' });

      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= rows.length) return res.json({ ok: true }); // already at edge

      const current = rows[idx];
      const swap = rows[swapIdx];

      // Swap sort_order values
      await db.execute(sql.raw(`
        UPDATE job_drawing_links SET sort_order = ${Number(swap.sort_order)} WHERE id = ${Number(current.link_id)}
      `));
      await db.execute(sql.raw(`
        UPDATE job_drawing_links SET sort_order = ${Number(current.sort_order)} WHERE id = ${Number(swap.link_id)}
      `));
    } else {
      // Reorder globally (project_drawings.sort_order) for unassigned drawings
      const [siblings] = await db.execute(sql.raw(`
        SELECT id, sort_order
        FROM project_drawings
        WHERE company_id = ${profile.companyId}
          AND status != 'deleted'
          AND id NOT IN (
            SELECT drawing_id FROM job_drawing_links WHERE company_id = ${profile.companyId}
          )
        ORDER BY sort_order ASC, id ASC
      `)) as unknown as [Array<{ id: number; sort_order: number }>];

      const rows = siblings ?? [];
      const idx = rows.findIndex(r => Number(r.id) === drawingId);
      if (idx === -1) return res.status(404).json({ error: 'Drawing not found' });

      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= rows.length) return res.json({ ok: true });

      const current = rows[idx];
      const swap = rows[swapIdx];

      await db.execute(sql.raw(`
        UPDATE project_drawings SET sort_order = ${Number(swap.sort_order)} WHERE id = ${Number(current.id)} AND company_id = ${profile.companyId}
      `));
      await db.execute(sql.raw(`
        UPDATE project_drawings SET sort_order = ${Number(current.sort_order)} WHERE id = ${Number(swap.id)} AND company_id = ${profile.companyId}
      `));
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/plan-manager/drawings/:id/reorder error:', err);
    res.status(500).json({ error: 'Failed to reorder' });
  }
}
