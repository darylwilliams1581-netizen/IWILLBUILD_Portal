/**
 * POST /api/plan-manager/drawings/:id/job-links
 * Link a job to a drawing.
 * Body: { jobId, contextNote? }
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

    const drawingId = parseInt(String(req.params.id), 10);
    if (isNaN(drawingId)) return res.status(400).json({ error: 'Invalid ID' });

    const { jobId, contextNote } = req.body as { jobId: number; contextNote?: string };
    if (!jobId) return res.status(400).json({ error: 'jobId required' });

    // Verify drawing belongs to company
    const [drawingRows] = await db.execute(sql`
      SELECT id FROM project_drawings WHERE id = ${drawingId} AND company_id = ${profile.companyId} LIMIT 1
    `) as unknown as [Array<{ id: number }>];
    if (!drawingRows?.length) return res.status(404).json({ error: 'Drawing not found' });

    // Upsert link
    await db.execute(sql`
      INSERT INTO job_drawing_links (job_id, drawing_id, context_note, created_by)
      VALUES (${jobId}, ${drawingId}, ${contextNote?.trim() ?? null}, ${session.user.id})
      ON DUPLICATE KEY UPDATE context_note = VALUES(context_note)
    `);

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('POST job-links error:', err);
    res.status(500).json({ error: 'Failed to link job' });
  }
}
