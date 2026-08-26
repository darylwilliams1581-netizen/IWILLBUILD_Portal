/**
 * GET /api/electrical-tests/photos/:photoId/view
 * Stream a test photo (authenticated, company-scoped).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { getDownloadStream, BUCKET_COMPANY_FILES } from '../../../../storage/storage-service.js';

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

    const photoId = parseInt(req.params['photoId'] as string, 10);
    if (isNaN(photoId)) return res.status(400).json({ error: 'Invalid photoId' });

    const [rows] = await db.execute(sql.raw(
      `SELECT p.storage_key, p.mime_type, p.original_name FROM electrical_test_photos p
       JOIN electrical_test_records r ON r.id = p.test_record_id
       WHERE p.id = ${photoId} AND r.company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ storage_key: string; mime_type: string; original_name: string }>];

    if (!rows?.length) return res.status(404).json({ error: 'Photo not found' });
    const photo = rows[0];

    const stream = await getDownloadStream(photo.storage_key, BUCKET_COMPANY_FILES);
    res.setHeader('Content-Type', photo.mime_type || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    stream.pipe(res);
  } catch (err) {
    console.error('GET /api/electrical-tests/photos/:photoId/view error:', err);
    return res.status(500).json({ error: 'Failed to load photo' });
  }
}
