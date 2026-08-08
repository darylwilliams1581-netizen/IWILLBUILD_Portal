/**
 * GET /api/me/profile-attachments/:attachmentId/download
 * ─────────────────────────────────────────────────────────────────────────────
 * Auth-gated download proxy for profile attachments stored in R2 / local.
 * Streams the file back with Content-Disposition: attachment so the browser
 * triggers a save dialog. Never exposes raw R2 signed URLs to the client.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { getDownloadStream } from '../../../../storage/storage-service.js';

const BUCKET = 'profile-attachments';

interface Attachment {
  id: string;
  filename: string;
  url: string;
  size: number;
  uploadedAt: string;
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

    // Load the user's attachment list from their profile
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

    // Build the storage key — same pattern as POST: userId/uuid-safeFilename
    const storageKey = `${session.user.id}/${target.id}-${target.filename}`;

    const { stream, mimeType, sizeBytes } = await getDownloadStream(storageKey, BUCKET);

    res.setHeader('Content-Type', mimeType ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(target.filename)}"`);
    if (sizeBytes) res.setHeader('Content-Length', String(sizeBytes));
    res.setHeader('Cache-Control', 'private, no-store');

    stream.pipe(res);
  } catch (err) {
    console.error('GET /api/me/profile-attachments/:id/download error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download failed' });
    }
  }
}
