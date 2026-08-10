/**
 * PATCH /api/job-cards/:id/photos/:photoId
 * ─────────────────────────────────────────────────────────────────────────────
 * Update the caption (label) of a Job Card photo.
 *
 * Body: { caption: string | null }
 *
 * Security:
 *   - Authenticated session required
 *   - Company ownership verified (job_cards.company_id = profile.companyId)
 *   - Photo must belong to the specified job card
 *   - Photo must not be locked
 *   - caption/label value is taken from the request body only — never from
 *     any other client-supplied field
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

    const cardId  = parseInt(String(req.params.id), 10);
    const photoId = parseInt(String(req.params.photoId), 10);
    if (isNaN(cardId) || isNaN(photoId)) return res.status(400).json({ error: 'Invalid ID' });

    // Verify card ownership
    const [cardRows] = await db.execute(
      sql`SELECT id FROM job_cards WHERE id = ${cardId} AND company_id = ${profile.companyId}`
    ) as unknown as [Array<{ id: number }>, unknown];
    if (!cardRows?.length) return res.status(404).json({ error: 'Job card not found' });

    // Fetch photo and verify it belongs to this card
    const [photoRows] = await db.execute(
      sql`SELECT id, locked FROM job_card_photos WHERE id = ${photoId} AND job_card_id = ${cardId}`
    ) as unknown as [Array<{ id: number; locked: number }>, unknown];
    if (!photoRows?.length) return res.status(404).json({ error: 'Photo not found' });

    const photo = photoRows[0];
    if (photo.locked) return res.status(409).json({ error: 'Photo is locked and cannot be edited.' });

    // Only accept caption from the body — ignore any other fields
    const rawCaption = (req.body as Record<string, unknown>)?.caption;
    const caption = typeof rawCaption === 'string' ? rawCaption.trim() || null : null;

    await db.execute(
      sql`UPDATE job_card_photos SET caption = ${caption} WHERE id = ${photoId} AND job_card_id = ${cardId}`
    );

    return res.json({ ok: true, caption });
  } catch (err) {
    console.error('PATCH /api/job-cards/:id/photos/:photoId error:', err);
    return res.status(500).json({ error: 'Failed to update caption' });
  }
}
