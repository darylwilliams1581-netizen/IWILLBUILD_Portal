/**
 * POST /api/job-cards/:id/photos
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload photos to a Job Card. Uses canonical uploadService.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { parseMultipartForm } from '../../../../lib/file-upload.js';
import { compressImageIfNeeded } from '../../../../storage/storage-service.js';
import { getSignedUrl } from '../../../../storage/storage-service.js';
import { uploadMedia, normaliseMime } from '../../../../lib/uploadService.js';
import type { CompatibilityContext } from '../../../../lib/uploadService.js';
import { randomUUID } from 'node:crypto';
import { buildObjectKey } from '../../../../storage/r2Config.js';

const BUCKET = 'job-card-photos';
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 10;

export default async function handler(req: Request, res: Response) {
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: MAX_BYTES, maxFiles: MAX_FILES });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
  }
  if (parsed.limitError) return res.status(400).json({ error: parsed.limitError });

  console.log(`[job-card-photos POST] cardId=${req.params.id} files=${parsed.files.length}`);

  if (parsed.files.length === 0) return res.status(400).json({ error: 'No files received.' });

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

    const cardId = parseInt(String(req.params.id), 10);
    if (isNaN(cardId) || cardId <= 0) return res.status(400).json({ error: 'Invalid job card ID' });

    const ownerResult = await db.execute(
      sql`SELECT id FROM job_cards WHERE id = ${cardId} AND company_id = ${profile.companyId}`
    );
    if (!(ownerResult[0] as Array<{ id: number }>)?.length) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    const caption = String(parsed.fields.caption ?? '').trim() || null;
    const clientId = (req.headers['x-client-id'] as string | undefined)?.trim() || null;
    const saved: Array<{ id: number; file_path: string; file_name: string; mime_type: string; caption: string | null; url: string }> = [];

    for (let i = 0; i < parsed.files.length; i++) {
      const file = parsed.files[i];
      normaliseMime(file);

      // Compress + convert HEIC→JPEG — fall through with raw buffer on failure
      try {
        const result = await compressImageIfNeeded(file.buffer, file.mimetype);
        file.buffer = result.buffer;
        file.mimetype = result.mimeType;
        file.size = result.buffer.length;
      } catch (convErr) {
        console.warn(`[job-card photos POST] compressImageIfNeeded threw for cardId=${cardId} mime=${file.mimetype}:`, convErr instanceof Error ? convErr.message : convErr);
        // Fall through with raw buffer — photo is saved as-is rather than lost
      }

      const ext = file.mimetype === 'image/png' ? 'png' : 'jpg';
      const storageKey = buildObjectKey({
        logicalNamespace: 'job-card-photos',
        companyId: profile.companyId,
        category: 'job-card-photos',
        uuid: randomUUID(),
        originalName: file.originalname || `photo.${ext}`,
      });

      const result = await uploadMedia({
        file,
        companyId: profile.companyId,
        userId: session.user.id,
        bucket: BUCKET,
        storageKey,
        destinationType: 'job_card_photo',
        destinationId: cardId,
        caption: caption ?? undefined,
        clientId: i === 0 ? clientId : null,
        imageOnly: true,
        allowHeic: false,
        insertCompatibilityRow: async (ctx: CompatibilityContext) => {
          // Store storageKey (permanent) not publicUrl (may be a 1-hour signed URL)
          const insResult = await db.execute(sql`
            INSERT INTO job_card_photos (job_card_id, company_id, file_path, file_name, mime_type, caption, uploaded_by)
            VALUES (${cardId}, ${ctx.companyId}, ${ctx.storageKey}, ${ctx.originalName}, ${ctx.mimeType}, ${caption}, ${ctx.userId})
          `);
          return Number((insResult[0] as { insertId?: number })?.insertId ?? 0) || null;
        },
      });

      // Generate a fresh signed URL for the response (storageKey is stored in DB, not the URL)
      let freshUrl = result.url;
      try {
        freshUrl = await getSignedUrl(storageKey, BUCKET, 3600);
      } catch { /* non-fatal — fall back to result.url */ }

      saved.push({
        id: result.destinationId ?? 0,
        file_path: storageKey,   // permanent key stored in DB
        file_name: result.originalName,
        mime_type: result.mimeType,
        caption,
        url: freshUrl,           // fresh signed URL for immediate display
      });
    }

    return res.status(201).json({ photos: saved });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number }).status ?? 500;
    console.error('[job-card-photos POST] error:', err);
    return res.status(status).json({ error: msg || 'Failed to upload photos' });
  }
}
