/**
 * POST /api/risk-register/:id/photo
 * Upload (or replace) the single snapshot photo for a hazard register entry.
 *
 * Security:
 *   - Company ownership verified before any operation.
 *   - Storage key generated server-side (never from client input).
 *   - Accepted MIME types: image/jpeg, image/png, image/webp, image/heic, image/heif.
 *   - Size limit: 20 MB (matches site-photo upload limit).
 *   - Replacing a photo: previous R2 object is deleted AFTER the new upload succeeds.
 *   - One photo maximum per hazard entry.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { parseMultipartForm } from '../../../../lib/file-upload.js';
import { compressImageIfNeeded, getSignedUrl, deleteFile } from '../../../../storage/storage-service.js';
import { uploadMedia, normaliseMime } from '../../../../lib/uploadService.js';
import type { CompatibilityContext } from '../../../../lib/uploadService.js';
import { randomUUID } from 'node:crypto';
import { buildObjectKey } from '../../../../storage/r2Config.js';

const BUCKET = 'hazard-photos';
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB — matches site-photo limit

// Accepted image MIME types (after normaliseMime)
const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export default async function handler(req: Request, res: Response) {
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: MAX_BYTES, maxFiles: 1 });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
  }
  if (parsed.limitError) return res.status(400).json({ error: parsed.limitError });
  if (parsed.files.length === 0) return res.status(400).json({ error: 'No file received.' });

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

    // Verify ownership and fetch existing photo_path in one query
    const [ownerRows] = await db.execute(sql`
      SELECT id, photo_path FROM risk_register
      WHERE id = ${entryId} AND company_id = ${profile.companyId} LIMIT 1
    `) as unknown as [Array<{ id: number; photo_path: string | null }>];
    if (!ownerRows?.length) return res.status(404).json({ error: 'Hazard not found' });

    const previousPhotoPath = ownerRows[0].photo_path ?? null;

    const file = parsed.files[0];
    normaliseMime(file);

    // Validate MIME type — reject non-image uploads
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      return res.status(400).json({
        error: `Unsupported file type "${file.mimetype}". Please upload a JPEG, PNG, WebP, or HEIC image.`,
      });
    }

    try {
      const result = await compressImageIfNeeded(file.buffer, file.mimetype);
      file.buffer = result.buffer;
      file.mimetype = result.mimeType;
      file.size = result.buffer.length;
    } catch { /* fall through with raw buffer */ }

    const ext = file.mimetype === 'image/png' ? 'png' : 'jpg';
    // Storage key generated entirely server-side
    const storageKey = buildObjectKey({
      logicalNamespace: BUCKET,
      companyId: profile.companyId,
      category: 'hazard-photos',
      uuid: randomUUID(),
      originalName: `photo.${ext}`,
    });

    let uploadedKey: string | null = null;

    await uploadMedia({
      file,
      companyId: profile.companyId,
      userId: session.user.id,
      bucket: BUCKET,
      storageKey,
      destinationType: 'hazard_photo',
      destinationId: entryId,
      imageOnly: true,
      allowHeic: true,
      insertCompatibilityRow: async (_ctx: CompatibilityContext) => {
        // Update the DB row to point at the new key
        await db.execute(sql`
          UPDATE risk_register
          SET photo_path = ${storageKey}, updated_at = NOW()
          WHERE id = ${entryId} AND company_id = ${profile.companyId}
        `);
        uploadedKey = storageKey;
        return null;
      },
    });

    // Delete the previous R2 object AFTER the new upload has succeeded
    if (previousPhotoPath && uploadedKey) {
      try {
        await deleteFile(previousPhotoPath, BUCKET);
      } catch (delErr) {
        // Non-fatal: log but don't fail the request
        console.warn('[hazard photo POST] failed to delete previous photo:', delErr);
      }
    }

    // Return a fresh signed URL for immediate display
    let url = '';
    try { url = await getSignedUrl(storageKey, BUCKET, 3600); } catch { /* non-fatal */ }

    return res.status(201).json({ photo_path: storageKey, url });
  } catch (err) {
    console.error('[hazard photo POST] error:', err);
    return res.status(500).json({ error: 'Failed to upload photo' });
  }
}
