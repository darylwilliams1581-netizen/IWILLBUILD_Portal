/**
 * GET /api/me/profile-attachments/:attachmentId/thumbnail
 * ─────────────────────────────────────────────────────────────────────────────
 * Auth-gated inline preview for profile attachments stored in R2 / local.
 * Streams the file back with Content-Disposition: inline so the browser can
 * render it as an <img> src. Only works for image/* MIME types — returns 415
 * for non-image files so the UI can fall back to a file icon.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { getDownloadStream } from '../../../../storage/storage-service.js';

const BUCKET = 'profile-attachments';

interface Attachment {
  id: string;
  filename: string;
  url: string;
  size: number;
  uploadedAt: string;
  mimeType?: string;
  mediaAssetId?: number;
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const { attachmentId } = req.params;

    const [rows] = await db.execute(
      sql`SELECT profile_attachments FROM profiles WHERE user_id = ${session.user.id} LIMIT 1`
    ) as unknown as [Array<{ profile_attachments?: string }>, unknown];

    let attachments: Attachment[] = [];
    try {
      const raw = rows?.[0]?.profile_attachments;
      if (raw) attachments = JSON.parse(raw) as Attachment[];
    } catch { /* ignore */ }

    const target = attachments.find(a => a.id === attachmentId);
    if (!target) return res.status(404).json({ error: 'Attachment not found' });

    // Only serve inline previews for images
    const mime = target.mimeType ?? '';
    if (!mime.startsWith('image/')) {
      return res.status(415).json({ error: 'Not an image' });
    }

    const storageKey = `${session.user.id}/${target.id}-${target.filename}`;
    const { stream, mimeType, sizeBytes } = await getDownloadStream(storageKey, BUCKET);

    res.setHeader('Content-Type', mimeType ?? mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(target.filename)}"`);
    if (sizeBytes) res.setHeader('Content-Length', String(sizeBytes));
    // Cache thumbnails for 5 minutes — they don't change
    res.setHeader('Cache-Control', 'private, max-age=300');

    stream.pipe(res);
  } catch (err) {
    console.error('GET /api/me/profile-attachments/:id/thumbnail error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Preview failed' });
    }
  }
}
