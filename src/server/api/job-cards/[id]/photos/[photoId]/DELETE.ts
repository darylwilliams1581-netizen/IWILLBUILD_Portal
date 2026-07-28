/**
 * DELETE /api/job-cards/:id/photos/:photoId
 * Remove a single photo from a Job Card.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';

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

    const cardId = Number(req.params.id);
    const photoId = Number(req.params.photoId);
    if (!cardId || !photoId) return res.status(400).json({ error: 'Invalid id' });

    // Verify card ownership
    const [cardRows] = await db.execute(
      sql`SELECT id FROM job_cards WHERE id = ${cardId} AND company_id = ${profile.companyId}`
    ) as unknown as [Array<{ id: number }>, unknown];
    if (!cardRows?.length) return res.status(404).json({ error: 'Job card not found' });

    await db.execute(
      sql`DELETE FROM job_card_photos WHERE id = ${photoId} AND job_card_id = ${cardId}`
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/job-cards/:id/photos/:photoId error:', err);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
}
