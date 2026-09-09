/**
 * GET /api/secure-share/:token/photos
 * ─────────────────────────────────────────────────────────────────────────────
 * Public endpoint — no login required.
 *
 * Resolves a secure share token with target_type = 'job_photos' and returns
 * a JSON list of photo URLs for that job, each signed via the existing
 * R2 presigned-URL mechanism.
 *
 * Used by the public share page to render a job photo gallery without
 * requiring the recipient to log in.
 *
 * Response: { ok: true, jobId: number, photos: Array<{ id, url, originalName }> }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { hashToken } from '../../../../lib/share-tokens.js';
import { getSignedUrl } from '../../../../storage/storage-service.js';

const PHOTO_BUCKET = 'job-photos';
/** Signed URL expiry for public gallery — 4 hours */
const PHOTO_URL_EXPIRY = 4 * 60 * 60;

type ShareRow = {
  id: number;
  company_id: number;
  target_type: string;
  target_id: string;
  permissions_json: string | null;
  expires_at: string | null;
  password_hash: string | null;
  max_uses: number | null;
  use_count: number;
  revoked: number;
};

type PhotoRow = {
  id: number;
  filename: string;
  original_name: string | null;
};

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params as { token: string };

    if (!token || token.length < 20) {
      return res.status(400).json({ error: 'Invalid token', code: 'INVALID' });
    }

    const tokenHash = hashToken(token);

    const [rows] = await db.execute(sql`
      SELECT id, company_id, target_type, target_id,
             permissions_json, expires_at, password_hash,
             max_uses, use_count, revoked
      FROM secure_share_links
      WHERE token_hash = ${tokenHash}
      LIMIT 1
    `) as unknown as [ShareRow[], unknown];

    const link = rows?.[0];

    if (!link) return res.status(404).json({ error: 'Link not found.', code: 'NOT_FOUND' });
    if (link.revoked) return res.status(410).json({ error: 'Link revoked.', code: 'REVOKED' });
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Link expired.', code: 'EXPIRED' });
    }
    if (link.max_uses !== null && link.use_count >= link.max_uses) {
      return res.status(410).json({ error: 'Link max uses reached.', code: 'MAX_USES' });
    }
    if (link.password_hash) {
      return res.status(403).json({ error: 'Password required.', code: 'PASSWORD_REQUIRED' });
    }
    if (link.target_type !== 'job_photos') {
      return res.status(400).json({ error: 'Not a photo gallery link.', code: 'WRONG_TYPE' });
    }

    const jobId = Number(link.target_id);
    if (!Number.isInteger(jobId) || jobId <= 0) {
      return res.status(400).json({ error: 'Invalid job reference.' });
    }

    // Fetch photos for this job (company-scoped)
    const [photoRows] = await db.execute(sql`
      SELECT id, filename, original_name
      FROM job_photos
      WHERE job_id    = ${jobId}
        AND company_id = ${link.company_id}
      ORDER BY created_at ASC
      LIMIT 500
    `) as unknown as [PhotoRow[], unknown];

    const photos = await Promise.all(
      (photoRows ?? []).map(async (p) => {
        let url: string | null = null;
        try {
          url = await getSignedUrl(p.filename, PHOTO_BUCKET, PHOTO_URL_EXPIRY);
        } catch {
          // Non-fatal — skip photos that can't be signed
        }
        return url ? { id: p.id, url, originalName: p.original_name ?? p.filename } : null;
      }),
    );

    // Increment use_count
    await db.execute(sql`
      UPDATE secure_share_links SET use_count = use_count + 1, updated_at = NOW()
      WHERE id = ${link.id}
    `).catch(() => {/* non-fatal */});

    return res.json({
      ok: true,
      jobId,
      photos: photos.filter((p): p is NonNullable<typeof p> => p !== null),
    });
  } catch (err) {
    console.error('GET /api/secure-share/:token/photos error:', err);
    return res.status(500).json({ error: 'Failed to load photos' });
  }
}
