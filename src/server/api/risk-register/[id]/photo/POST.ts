/**
 * POST /api/risk-register/:id/photo
 * Upload (or replace) the single snapshot photo for a hazard register entry.
 * Company-scoped — only the owning company can upload.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { parseMultipartForm } from '../../../../lib/file-upload.js';
import { compressImageIfNeeded, getSignedUrl } from '../../../../storage/storage-service.js';
import { uploadMedia, normaliseMime } from '../../../../lib/uploadService.js';
import type { CompatibilityContext } from '../../../../lib/uploadService.js';
import { randomUUID } from 'node:crypto';
import { buildObjectKey } from '../../../../storage/r2Config.js';

const BUCKET = 'hazard-photos';
const MAX_BYTES = 20 * 1024 * 1024;

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

    // Verify ownership
    const [ownerRows] = await db.execute(sql`
      SELECT id FROM risk_register WHERE id = ${entryId} AND company_id = ${profile.companyId} LIMIT 1
    `) as unknown as [Array<{ id: number }>];
    if (!ownerRows?.length) return res.status(404).json({ error: 'Hazard not found' });

    const file = parsed.files[0];
    normaliseMime(file);

    try {
      const result = await compressImageIfNeeded(file.buffer, file.mimetype);
      file.buffer = result.buffer;
      file.mimetype = result.mimeType;
      file.size = result.buffer.length;
    } catch { /* fall through with raw buffer */ }

    const ext = file.mimetype === 'image/png' ? 'png' : 'jpg';
    const storageKey = buildObjectKey({
      logicalNamespace: BUCKET,
      companyId: profile.companyId,
      category: 'hazard-photos',
      uuid: randomUUID(),
      originalName: file.originalname || `photo.${ext}`,
    });

    await uploadMedia({
      file,
      companyId: profile.companyId,
      userId: session.user.id,
      bucket: BUCKET,
      storageKey,
      destinationType: 'hazard_photo',
      destinationId: entryId,
      imageOnly: true,
      allowHeic: false,
      insertCompatibilityRow: async (_ctx: CompatibilityContext) => {
        // Store storageKey on the risk_register row (replaces any previous photo)
        await db.execute(sql`
          UPDATE risk_register
          SET photo_path = ${storageKey}, updated_at = NOW()
          WHERE id = ${entryId} AND company_id = ${profile.companyId}
        `);
        return null;
      },
    });

    // Return a fresh signed URL for immediate display
    let url = '';
    try { url = await getSignedUrl(storageKey, BUCKET, 3600); } catch { /* non-fatal */ }

    return res.status(201).json({ photo_path: storageKey, url });
  } catch (err) {
    console.error('[hazard photo POST] error:', err);
    return res.status(500).json({ error: 'Failed to upload photo' });
  }
}
