/**
 * POST /api/asset-manager/assets/:id/photos
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload photos for an Asset Manager asset.
 * Migrated from local filesystem to storage service + canonical uploadService.
 * Compatibility row still inserted into am_asset_photos.
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

const BUCKET = 'am-asset-photos';
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

  const assetId = parseInt(String(req.params.id), 10);
  if (isNaN(assetId)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const [check] = await db.execute(
      sql`SELECT id FROM am_assets WHERE id = ${assetId} AND company_id = ${profile.companyId}`
    ) as unknown as [unknown[], unknown];
    if (!(check as unknown[]).length) return res.status(404).json({ error: 'Not found' });

    const caption = String((parsed.fields as Record<string, string>).caption ?? '').trim() || null;
    const clientId = (req.headers['x-client-id'] as string | undefined)?.trim() || null;
    const uploaded: Array<{ id: number; filePath: string; fileName: string }> = [];

    for (let i = 0; i < parsed.files.length; i++) {
      const file = parsed.files[i];
      normaliseMime(file);

      const ext = file.originalname.includes('.') ? (file.originalname.split('.').pop() ?? 'jpg') : 'jpg';
      const storageKey = buildObjectKey({
        logicalNamespace: 'am-asset-photos',
        companyId: profile.companyId,
        category: 'am-asset-photos',
        uuid: randomUUID(),
        originalName: file.originalname || `photo.${ext}`,
      });

      const result = await uploadMedia({
        file,
        companyId: profile.companyId,
        userId: session.user.id,
        bucket: BUCKET,
        storageKey,
        destinationType: 'fleet_asset_photo',
        destinationId: assetId,
        caption: caption ?? undefined,
        clientId: i === 0 ? clientId : null,
        imageOnly: true,
        allowHeic: true, // accept HEIC — no conversion for asset photos
        insertCompatibilityRow: async (ctx: CompatibilityContext) => {
          const [result] = await db.execute(sql.raw(`
            INSERT INTO am_asset_photos (asset_id, company_id, file_path, file_name, mime_type, caption, uploaded_by)
            VALUES (${assetId}, ${ctx.companyId}, '${ctx.publicUrl.replace(/'/g, "''")}', '${ctx.originalName.replace(/'/g, "''")}', '${ctx.mimeType}', ${caption ? `'${caption.replace(/'/g, "''")}'` : 'NULL'}, '${ctx.userId}')
          `)) as unknown as [{ insertId: number }, unknown];
          return result.insertId ?? null;
        },
      });

      uploaded.push({ id: result.destinationId ?? 0, filePath: result.url, fileName: result.originalName });

      // CP12A: Create pending Image Safeguard record (non-blocking, best-effort)
      void createPendingSafeguardRecord({
        companyId: profile.companyId,
        userId: session.user.id,
        storageRef: `asset_photo:${result.destinationId ?? result.storageKey}`,
        surface: 'asset_photo',
      }).catch(() => { /* safeguard record failure must not affect upload */ });
    }

    return res.status(201).json({ ok: true, photos: uploaded });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number }).status ?? 500;
    console.error('POST asset photo error:', err);
    return res.status(status).json({ error: msg || 'Failed to upload' });
  }
}
