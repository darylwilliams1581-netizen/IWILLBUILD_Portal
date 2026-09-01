/**
 * POST /api/asset-manager/inspections/:id/photos
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload photos for an Asset Manager inspection.
 * Migrated from multer + local filesystem to busboy + storage service +
 * canonical uploadService. Compatibility row still inserted into am_media.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';
import { parseMultipartForm } from '../../../../../lib/file-upload.js';
import { uploadMedia, normaliseMime } from '../../../../../lib/uploadService.js';
import type { CompatibilityContext } from '../../../../../lib/uploadService.js';
import { randomUUID } from 'node:crypto';
import { buildObjectKey } from '../../../../../storage/r2Config.js';
import { createPendingSafeguardRecord } from '../../../../../lib/imageSafeguardService.js';

const BUCKET = 'am-inspection-media';
const MAX_SIZE = 20 * 1024 * 1024;

export default async function handler(req: Request, res: Response) {
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: MAX_SIZE, maxFiles: 10 });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
  }
  if (parsed.limitError) return res.status(400).json({ error: parsed.limitError });
  if (!parsed.files.length) return res.status(400).json({ error: 'No file uploaded' });

  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { session, profile } = sp;

  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const [check] = await db.execute(
      sql`SELECT asset_id FROM am_inspections WHERE id = ${id} AND company_id = ${profile.companyId}`
    ) as unknown as [Array<{ asset_id: number }>, unknown];
    if (!check.length) return res.status(404).json({ error: 'Inspection not found' });

    const assetId = check[0].asset_id;
    const clientId = (req.headers['x-client-id'] as string | undefined)?.trim() || null;

    // Only process the first file (single-file endpoint)
    const file = parsed.files[0];
    normaliseMime(file);

    const ext = file.originalname.includes('.') ? (file.originalname.split('.').pop() ?? 'bin') : 'bin';
    const storageKey = buildObjectKey({
      logicalNamespace: 'am-inspection-media',
      companyId: profile.companyId,
      category: 'am-inspection-media',
      uuid: randomUUID(),
      originalName: file.originalname || `photo.${ext}`,
    });

    const result = await uploadMedia({
      file,
      companyId: profile.companyId,
      userId: session.user.id,
      bucket: BUCKET,
      storageKey,
      destinationType: 'fleet_inspection_media',
      destinationId: id,
      clientId,
      imageOnly: false,
      insertCompatibilityRow: async (ctx: CompatibilityContext) => {
        const [dbResult] = await db.execute(sql`
          INSERT INTO am_media (asset_id, inspection_id, company_id, category, file_path, file_name, mime_type, uploaded_by)
          VALUES (${assetId}, ${id}, ${ctx.companyId}, 'site_photo', ${ctx.publicUrl}, ${ctx.originalName}, ${ctx.mimeType}, ${ctx.userId})
        `) as unknown as [{ insertId: number }, unknown];
        return dbResult.insertId ?? null;
      },
    });

    // CP12A: Create pending Image Safeguard record (non-blocking, best-effort)
    void createPendingSafeguardRecord({
      companyId: profile.companyId,
      userId: session.user.id,
      storageRef: `inspection_photo:${result.destinationId ?? result.storageKey}`,
      surface: 'inspection_photo',
    }).catch(() => { /* safeguard record failure must not affect upload */ });

    return res.status(201).json({ ok: true, id: result.destinationId, filePath: result.url, fileName: result.originalName });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number }).status ?? 500;
    console.error('POST inspection photos error:', err);
    return res.status(status).json({ error: msg || 'Failed to upload' });
  }
}
