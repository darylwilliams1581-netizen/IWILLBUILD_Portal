/**
 * GET /api/risk-register/:id/photo-url
 * Returns a fresh 1-hour signed URL for the hazard's snapshot photo.
 * Returns { url: null } if no photo is set.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { getSignedUrl } from '../../../../storage/storage-service.js';

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

    const entryId = parseInt(String(req.params.id), 10);
    if (isNaN(entryId) || entryId <= 0) return res.status(400).json({ error: 'Invalid ID' });

    const [rows] = await db.execute(sql`
      SELECT photo_path FROM risk_register
      WHERE id = ${entryId} AND company_id = ${profile.companyId} LIMIT 1
    `) as unknown as [Array<{ photo_path: string | null }>];

    if (!rows?.length) return res.status(404).json({ error: 'Not found' });

    const photoPath = rows[0].photo_path;
    if (!photoPath) return res.json({ url: null });

    try {
      const url = await getSignedUrl(photoPath, 'hazard-photos', 3600);
      return res.json({ url });
    } catch {
      return res.json({ url: null });
    }
  } catch (err) {
    console.error('[hazard photo-url GET] error:', err);
    return res.status(500).json({ error: 'Failed to get photo URL' });
  }
}
