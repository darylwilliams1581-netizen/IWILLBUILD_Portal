/**
 * GET /api/job-cards/:id/photos/:photoId/download
 * ─────────────────────────────────────────────────────────────────────────────
 * Authenticated download of a Job Card photo.
 *
 * - Streams the file from R2 storage with a meaningful Content-Disposition
 *   filename (caption → file_name → fallback).
 * - Never exposes the raw R2 storage key to the browser.
 * - Verifies company ownership before serving.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { profiles } from '../../../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';
import { getDownloadStream } from '../../../../../../storage/storage-service.js';

const PHOTO_BUCKET = 'job-card-photos';

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

    // Fetch photo
    const [photoRows] = await db.execute(
      sql`SELECT id, file_path, file_name, mime_type, caption FROM job_card_photos
          WHERE id = ${photoId} AND job_card_id = ${cardId}`
    ) as unknown as [Array<{
      id: number;
      file_path: string;
      file_name: string;
      mime_type: string | null;
      caption: string | null;
    }>, unknown];
    if (!photoRows?.length) return res.status(404).json({ error: 'Photo not found' });

    const photo = photoRows[0];
    const storageKey = photo.file_path;

    // Reject legacy rows that stored a full URL instead of a storage key
    if (!storageKey || storageKey.startsWith('http')) {
      return res.status(422).json({ error: 'Photo cannot be downloaded — legacy URL format.' });
    }

    const { stream, mimeType, sizeBytes } = await getDownloadStream(storageKey, PHOTO_BUCKET);

    const resolvedMime = photo.mime_type ?? mimeType ?? 'image/jpeg';
    const ext = resolvedMime.includes('png') ? '.png'
      : resolvedMime.includes('webp') ? '.webp'
      : '.jpg';

    const rawName = (photo.caption ?? '').trim()
      || (photo.file_name ?? '').trim()
      || `job-card-${cardId}-photo-${photoId}${ext}`;

    const hasExt = /\.[a-zA-Z0-9]{2,5}$/.test(rawName);
    const downloadName = hasExt ? rawName : `${rawName}${ext}`;

    // RFC 5987 — Unicode-safe filename
    const encodedName = encodeURIComponent(downloadName).replace(/'/g, '%27');
    const safeName    = downloadName.replace(/"/g, '_');

    res.setHeader('Content-Type', resolvedMime);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`);
    if (sizeBytes > 0) res.setHeader('Content-Length', String(sizeBytes));

    stream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'File not found in storage' });
    });
    stream.pipe(res);
  } catch (err) {
    console.error('GET /api/job-cards/:id/photos/:photoId/download error:', err);
    res.status(500).json({ error: 'Failed to download photo' });
  }
}
