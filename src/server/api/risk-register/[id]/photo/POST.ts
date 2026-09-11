import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';

import { db } from '../../../../db/client.js';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';
import { parseMultipartForm } from '../../../../lib/file-upload.js';
import { normaliseMime } from '../../../../lib/uploadService.js';
import { buildObjectKey } from '../../../../storage/r2Config.js';
import { BUCKET_HAZARD_PHOTOS, compressImageIfNeeded, deleteFile, saveFile } from '../../../../storage/storage-service.js';

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;
  const { profile } = auth;
  const hazardId = Number(req.params.id);
  if (!Number.isInteger(hazardId) || hazardId <= 0) return res.status(400).json({ error: 'Invalid hazard ID' });

  const [hazards] = await db.execute(sql`
    SELECT id, photo_path FROM risk_register
    WHERE id = ${hazardId} AND company_id = ${profile.companyId}
    LIMIT 1
  `) as unknown as [Array<{ id: number; photo_path: string | null }>, unknown];
  const hazard = hazards?.[0];
  if (!hazard) return res.status(404).json({ error: 'Hazard not found' });

  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: MAX_PHOTO_BYTES, maxFiles: 1 });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Upload failed' });
  }
  if (parsed.limitError) return res.status(400).json({ error: parsed.limitError });
  const file = parsed.file;
  if (!file) return res.status(400).json({ error: 'Select a photo' });

  normaliseMime(file);
  if (!ALLOWED.has(file.mimetype)) return res.status(400).json({ error: 'Photos only' });

  const compressed = await compressImageIfNeeded(file.buffer, file.mimetype);
  const ext = compressed.mimeType === 'image/png' ? 'png' : compressed.mimeType === 'image/webp' ? 'webp' : compressed.mimeType === 'image/gif' ? 'gif' : 'jpg';
  const uuid = randomUUID();
  const storageKey = buildObjectKey({
    logicalNamespace: 'hazard-photos',
    companyId: profile.companyId,
    category: 'hazards',
    uuid,
    originalName: `${uuid}.${ext}`,
  });

  let saved: Awaited<ReturnType<typeof saveFile>> | null = null;
  try {
    saved = await saveFile({
      buffer: compressed.buffer,
      originalName: `${uuid}.${ext}`,
      mimeType: compressed.mimeType,
      bucket: BUCKET_HAZARD_PHOTOS,
      storageKey,
    });
    await db.execute(sql`
      UPDATE risk_register SET photo_path = ${saved.storageKey}, updated_at = NOW()
      WHERE id = ${hazardId} AND company_id = ${profile.companyId}
    `);
  } catch (error) {
    if (saved?.storageKey) await deleteFile(saved.storageKey, BUCKET_HAZARD_PHOTOS);
    const status = (error as { status?: number })?.status ?? 500;
    return res.status(status).json({ error: error instanceof Error ? error.message : 'Upload failed' });
  }

  if (hazard.photo_path && hazard.photo_path !== saved.storageKey) {
    await deleteFile(hazard.photo_path, BUCKET_HAZARD_PHOTOS);
  }
  return res.status(201).json({ photo_url: saved.publicUrl });
}
