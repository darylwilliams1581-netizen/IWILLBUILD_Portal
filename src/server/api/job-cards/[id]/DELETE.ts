/**
 * DELETE /api/job-cards/:id
 * Delete a Job Card and its child records (materials, photos).
 * Only allowed when status is 'draft' or 'complete' (not invoiced/converted).
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const [rows] = await db.execute(
      sql`SELECT id, status FROM job_cards WHERE id = ${id} AND company_id = ${profile.companyId}`
    ) as unknown as [Array<{ id: number; status: string }>, unknown];

    if (!rows?.length) return res.status(404).json({ error: 'Job card not found' });

    const card = rows[0];
    if (card.status === 'invoiced') {
      return res.status(409).json({ error: 'Cannot delete an invoiced Job Card. Void the invoice first.' });
    }
    if (card.status === 'converted') {
      return res.status(409).json({ error: 'Cannot delete a converted Job Card.' });
    }

    // Delete child records first
    await db.execute(sql`DELETE FROM job_card_materials WHERE job_card_id = ${id}`);
    await db.execute(sql`DELETE FROM job_card_photos WHERE job_card_id = ${id}`);
    await db.execute(sql`DELETE FROM job_cards WHERE id = ${id} AND company_id = ${profile.companyId}`);

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/job-cards/:id error:', err);
    res.status(500).json({ error: 'Failed to delete job card' });
  }
}
