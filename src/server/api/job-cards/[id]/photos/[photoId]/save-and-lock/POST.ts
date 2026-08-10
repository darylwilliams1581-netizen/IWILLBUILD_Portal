/**
 * POST /api/job-cards/:id/photos/:photoId/save-and-lock
 * ─────────────────────────────────────────────────────────────────────────────
 * Atomic Save & Lock for a Job Card photo.
 *
 * Behaviour:
 *   1. Validate permissions and lock state.
 *   2. Parse and validate the uploaded image (MIME, size, decodability).
 *   3. Compress the edited image.
 *   4. Upload the edited version to R2 under a NEW unique storage key.
 *   5. Confirm the stored object exists (getSignedUrl as a probe).
 *   6. In a single SQL transaction:
 *        - Preserve original_file_path (set once, never overwritten)
 *        - Update file_path to the new edited key (current serving key)
 *        - Set edited_file_path, edited_at, edited_by
 *        - Set locked=1, locked_at=NOW(), locked_by=userId
 *   7. Return the updated photo row with a fresh signed URL.
 *
 *   If storage upload fails → no DB change.
 *   If DB transaction fails → delete the orphaned edited object from R2.
 *   A second request for an already-locked photo returns 409.
 *
 * Security:
 *   - Authenticated session required
 *   - Company ownership verified
 *   - Job card ownership verified
 *   - Photo must belong to this job card
 *   - Photo must not already be locked
 *   - MIME type validated server-side (JPEG/PNG/WebP only)
 *   - File size capped at 20 MB
 *   - Storage key, company ID, lock status never trusted from client
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { profiles } from '../../../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';
import { randomUUID } from 'node:crypto';
import { parseMultipartForm } from '../../../../../../lib/file-upload.js';
import {
  compressImageIfNeeded,
  saveFile,
  deleteFile,
  getSignedUrl,
  ALLOWED_IMAGE_MIMES,
} from '../../../../../../storage/storage-service.js';

const PHOTO_BUCKET = 'job-card-photos';
const MAX_BYTES    = 20 * 1024 * 1024;

export default async function handler(req: Request, res: Response) {
  // ── 1. Parse multipart ──────────────────────────────────────────────────────
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: MAX_BYTES, maxFiles: 1 });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
  }
  if (parsed.limitError) return res.status(400).json({ error: parsed.limitError });

  const file = parsed.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  if (!ALLOWED_IMAGE_MIMES[file.mimetype]) {
    return res.status(400).json({
      error: `"${file.originalname}" is not a supported type. Use JPEG, PNG, or WebP.`,
    });
  }

  // ── 2. Auth + ownership ─────────────────────────────────────────────────────
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

    // Only admins may save & lock during the pilot
    const isAdmin = profile.role === 'admin' || profile.permAdmin === true;
    if (!isAdmin) return res.status(403).json({ error: 'Admin permission required to save and lock photos.' });

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
      sql`SELECT id, file_path, file_name, mime_type, caption, locked, original_file_path
          FROM job_card_photos
          WHERE id = ${photoId} AND job_card_id = ${cardId} AND company_id = ${profile.companyId}`
    ) as unknown as [Array<{
      id: number;
      file_path: string;
      file_name: string;
      mime_type: string | null;
      caption: string | null;
      locked: number;
      original_file_path: string | null;
    }>, unknown];
    if (!photoRows?.length) return res.status(404).json({ error: 'Photo not found' });

    const photo = photoRows[0];

    // ── 3. Reject if already locked ─────────────────────────────────────────
    if (photo.locked) {
      return res.status(409).json({ error: 'Photo is already locked and cannot be edited.' });
    }

    // ── 4. Compress + upload edited version ─────────────────────────────────
    const { buffer: compressed, mimeType: outMime } = await compressImageIfNeeded(
      file.buffer,
      file.mimetype,
    );

    const ext        = outMime === 'image/png' ? 'png' : 'jpg';
    const storageKey = `edited-${randomUUID()}.${ext}`;

    let savedKey: string;
    try {
      const result = await saveFile({
        buffer: compressed,
        originalName: `edited-${photo.file_name}`,
        mimeType: outMime,
        bucket: PHOTO_BUCKET,
        storageKey,
      });
      savedKey = result.storageKey;
    } catch (storageErr) {
      console.error('[save-and-lock] Storage upload failed:', storageErr);
      return res.status(502).json({ error: 'Failed to store edited photo. Original is unchanged.' });
    }

    // ── 5. Probe: confirm the object is retrievable ──────────────────────────
    try {
      await getSignedUrl(savedKey, PHOTO_BUCKET, 60);
    } catch (probeErr) {
      // Object not accessible — clean up and abort
      console.error('[save-and-lock] Storage probe failed:', probeErr);
      try { await deleteFile(savedKey, PHOTO_BUCKET); } catch { /* best-effort */ }
      return res.status(502).json({ error: 'Edited photo could not be verified in storage. Original is unchanged.' });
    }

    // ── 6. DB transaction ────────────────────────────────────────────────────
    const originalKey = photo.original_file_path ?? photo.file_path;
    const now         = new Date().toISOString().slice(0, 19).replace('T', ' '); // MySQL DATETIME

    try {
      await db.execute(sql`
        UPDATE job_card_photos
        SET
          file_path          = ${savedKey},
          original_file_path = COALESCE(original_file_path, ${originalKey}),
          edited_file_path   = ${savedKey},
          edited_at          = ${now},
          edited_by          = ${session.user.id},
          locked             = 1,
          locked_at          = ${now},
          locked_by          = ${session.user.id}
        WHERE id = ${photoId}
          AND job_card_id = ${cardId}
          AND company_id  = ${profile.companyId}
          AND locked      = 0
      `);
    } catch (dbErr) {
      // DB failed — remove the orphaned edited object
      console.error('[save-and-lock] DB update failed:', dbErr);
      try { await deleteFile(savedKey, PHOTO_BUCKET); } catch { /* best-effort */ }
      return res.status(500).json({ error: 'Failed to save photo record. Edited file removed. Original is unchanged.' });
    }

    // ── 7. Return updated row with fresh signed URL ──────────────────────────
    const [updatedRows] = await db.execute(
      sql`SELECT * FROM job_card_photos WHERE id = ${photoId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const updated = updatedRows?.[0] ?? null;
    let url: string | null = null;
    if (updated?.file_path && typeof updated.file_path === 'string') {
      try { url = await getSignedUrl(updated.file_path, PHOTO_BUCKET, 3600); } catch { /* best-effort */ }
    }

    return res.json({ ok: true, photo: updated ? { ...updated, url } : null });
  } catch (err) {
    console.error('POST /api/job-cards/:id/photos/:photoId/save-and-lock error:', err);
    return res.status(500).json({ error: 'Failed to save and lock photo' });
  }
}
