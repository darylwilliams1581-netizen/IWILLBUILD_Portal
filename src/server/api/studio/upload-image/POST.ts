/**
 * POST /api/studio/upload-image
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload an image for use in the Studio block canvas (ImageBlock).
 * Stores in the doc-assets bucket and returns a publicUrl that can be embedded
 * directly in builder_json — no auth-gated download proxy needed.
 *
 * Response: { url: string }   — the public (or presigned) URL for the image
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { parseMultipartForm } from '../../../lib/file-upload.js';
import {
  saveFile,
  validateUpload,
  compressImageIfNeeded,
  checkStorageQuota,
  ALLOWED_IMAGE_MIMES,
  MAX_FILE_SIZE_BYTES,
} from '../../../storage/storage-service.js';
import { getPlanLimits, getCompanyPlan } from '../../../lib/plan-limits.js';
import { randomUUID } from 'node:crypto';
import { buildObjectKey } from '../../../storage/r2Config.js';
import { extForMime } from '../../../lib/file-upload.js';

const BUCKET = 'doc-assets';

export default async function handler(req: Request, res: Response) {
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: MAX_FILE_SIZE_BYTES, maxFiles: 1 });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
  }
  if (parsed.limitError) {
    return res.status(400).json({ error: `File exceeds the ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB limit.` });
  }

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

    const file = parsed.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // Only images are accepted for Studio image blocks
    if (!ALLOWED_IMAGE_MIMES[file.mimetype]) {
      return res.status(400).json({ error: 'Only image files are accepted (JPEG, PNG, WebP, GIF).' });
    }

    const validation = validateUpload({ originalname: file.originalname, mimetype: file.mimetype, size: file.size });
    if (!validation.ok) return res.status(400).json({ code: validation.code, error: validation.error });

    // Plan limit: storage quota
    const plan = await getCompanyPlan(profile.companyId);
    const limits = await getPlanLimits(profile.companyId, plan);
    const quotaCheck = await checkStorageQuota(profile.companyId, file.size, limits.storageBytes);
    if (!quotaCheck.allowed) return res.status(403).json({ code: 'limit_reached', error: quotaCheck.error });

    // Compress image
    try {
      const compressed = await compressImageIfNeeded(file.buffer, file.mimetype);
      file.buffer = compressed.buffer;
      file.mimetype = compressed.mimeType;
      file.size = compressed.buffer.length;
    } catch { /* non-fatal — use original */ }

    const ext = extForMime(file.mimetype);
    const storageKey = buildObjectKey({
      logicalNamespace: 'doc-assets',
      companyId: profile.companyId,
      category: 'doc-assets',
      uuid: randomUUID(),
      originalName: file.originalname,
    });

    const saved = await saveFile({
      storageKey,
      bucket: BUCKET,
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
    });

    return res.status(201).json({ url: saved.publicUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('POST /api/studio/upload-image error:', err);
    return res.status(500).json({ error: msg || 'Failed to upload image' });
  }
}
