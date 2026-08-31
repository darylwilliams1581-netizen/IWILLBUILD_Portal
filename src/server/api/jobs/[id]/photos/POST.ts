/**
 * POST /api/jobs/:id/photos
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload photos to a job. Uses the canonical uploadService which:
 *  - Normalises MIME (extension → magic-byte → safe default)
 *  - Validates MIME
 *  - Uploads to R2 / storage provider
 *  - Inserts media_assets + media_asset_links rows
 *  - Inserts compatibility row in job_photos
 *  - Handles X-Client-Id idempotency
 *  - Rolls back storage on DB failure
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { jobPhotos, profiles, jobs } from '../../../../db/schema.js';
import { eq, and, count, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { getPlanLimits, getCompanyPlan, checkLimit } from '../../../../lib/plan-limits.js';
import { randomUUID } from 'node:crypto';
import { buildObjectKey } from '../../../../storage/r2Config.js';
import { parseMultipartForm } from '../../../../lib/file-upload.js';
import {
  compressImageIfNeeded,
  generateThumbnail,
  generatePreview,
  getImageDimensions,
} from '../../../../storage/storage-service.js';
import { uploadMedia, normaliseMime } from '../../../../lib/uploadService.js';
import type { CompatibilityContext } from '../../../../lib/uploadService.js';

const PHOTO_BUCKET = 'job-photos';
const MAX_PHOTOS_PER_JOB = 200;
const PHOTO_MAX_BYTES = 20 * 1024 * 1024;

export default async function handler(req: Request, res: Response) {
  let parsed;
  try {
    parsed = await parseMultipartForm(req, { maxFileSize: PHOTO_MAX_BYTES, maxFiles: 10 });
  } catch (err) {
    return res.status(400).json({ code: 'upload_error', error: err instanceof Error ? err.message : 'Upload error' });
  }
  if (parsed.limitError) return res.status(400).json({ code: 'upload_error', error: parsed.limitError });

  console.log(`[photos POST] jobId=${req.params.id} files=${parsed.files.length}`);

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

    const jobId = parseInt(String(req.params.id), 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const clientId = (req.headers['x-client-id'] as string | undefined)?.trim() || null;

    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const files = parsed.files;
    if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

    // ── Per-job photo limit ───────────────────────────────────────────────────
    const [photoCountRow] = await db
      .select({ c: count() })
      .from(jobPhotos)
      .where(and(eq(jobPhotos.jobId, jobId), eq(jobPhotos.companyId, profile.companyId)));
    const currentCount = photoCountRow?.c ?? 0;
    if (currentCount >= MAX_PHOTOS_PER_JOB) {
      return res.status(400).json({ code: 'limit_reached', error: `This job has reached the ${MAX_PHOTOS_PER_JOB}-photo limit.` });
    }
    if (currentCount + files.length > MAX_PHOTOS_PER_JOB) {
      const remaining = MAX_PHOTOS_PER_JOB - currentCount;
      return res.status(400).json({ code: 'limit_reached', error: `Only ${remaining} photo${remaining === 1 ? '' : 's'} can be added before reaching the ${MAX_PHOTOS_PER_JOB}-photo limit.` });
    }

    // ── Plan-level total photo limit ──────────────────────────────────────────
    const plan = await getCompanyPlan(profile.companyId);
    const limits = await getPlanLimits(profile.companyId, plan);
    const [totalPhotoRow] = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM job_photos WHERE company_id = ${profile.companyId}`
    ) as unknown as [Array<{ cnt: number }>, unknown];
    const totalPhotos = Number(totalPhotoRow?.[0]?.cnt ?? 0);
    const planCheck = checkLimit(totalPhotos, limits.totalPhotos, 'Total Job Photos');
    if (!planCheck.allowed) return res.status(403).json({ code: planCheck.code, error: planCheck.message });

    const label = typeof parsed.fields?.label === 'string' ? parsed.fields.label.trim() : null;
    const uploaderName = session.user.name ?? session.user.email ?? null;

    const saved: Array<{ id: number; filename: string; url: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Normalise MIME before compression
      normaliseMime(file);

      // Compress + convert HEIC→JPEG
      // compressImageIfNeeded has its own internal try/catch and returns the raw
      // buffer on any Jimp failure — it should never throw. We still wrap it here
      // as a safety net, but on failure we fall through with the raw buffer rather
      // than returning a 400, so the photo is saved as-is instead of being lost.
      let compressed: Buffer = file.buffer;
      let outMime: string = file.mimetype;
      try {
        const result = await compressImageIfNeeded(file.buffer, file.mimetype);
        compressed = result.buffer;
        outMime = result.mimeType;
        file.buffer = compressed;
        file.mimetype = outMime;
        file.size = compressed.length;
      } catch (convErr) {
        // Compression failed — store the raw buffer rather than rejecting the upload.
        // This preserves the photo even if Jimp can't process it (e.g. unusual PNG
        // colour profiles, 16-bit PNGs, or bundle issues on Alpine).
        console.warn(`[photos POST] compressImageIfNeeded threw for jobId=${jobId} mime=${file.mimetype}:`, convErr instanceof Error ? convErr.message : convErr);
        // compressed / outMime already hold the raw values — no change needed
      }

      const ext = outMime === 'image/png' ? 'png' : 'jpg';
      const uuid = randomUUID();
      const storageKey = buildObjectKey({
        logicalNamespace: 'job-photos',
        companyId: profile.companyId,
        category: 'job-photos',
        uuid,
        originalName: `${uuid}.${ext}`,
      });

      // Get dimensions (non-blocking, best-effort)
      let imgWidth: number | null = null;
      let imgHeight: number | null = null;
      try {
        const dims = await getImageDimensions(compressed, outMime);
        if (dims) { imgWidth = dims.width; imgHeight = dims.height; }
      } catch { /* non-fatal */ }

      // Use canonical upload service — inserts media_assets + media_asset_links
      // + compatibility row in job_photos
      const result = await uploadMedia({
        file,
        companyId: profile.companyId,
        userId: session.user.id,
        bucket: PHOTO_BUCKET,
        storageKey,
        destinationType: 'job_photo',
        destinationId: jobId,
        label: label ?? undefined,
        clientId: i === 0 ? clientId : null, // idempotency on first file only
        imageOnly: true,
        allowHeic: false, // already converted above
        insertCompatibilityRow: async (ctx: CompatibilityContext) => {
          const [inserted] = await db.insert(jobPhotos).values({
            jobId,
            companyId: profile.companyId,
            filename: ctx.storageKey,
            originalName: ctx.originalName,
            label: label || null,
            mimeType: ctx.mimeType,
            sizeBytes: ctx.sizeBytes,
            imageWidth: imgWidth,
            imageHeight: imgHeight,
            uploadedByUserId: ctx.userId,
            uploadedByName: uploaderName,
          }).$returningId();
          return inserted.id;
        },
      });

      saved.push({ id: result.destinationId!, filename: result.storageKey, url: result.url });

      // Generate thumbnail + preview asynchronously (non-blocking)
      const photoId = result.destinationId!;
      const srcBuffer = compressed;
      const srcMime = outMime;
      setImmediate(async () => {
        try {
          const [thumb, preview] = await Promise.all([
            generateThumbnail(srcBuffer, srcMime),
            generatePreview(srcBuffer, srcMime),
          ]);
          const thumbKey   = thumb   ? `${randomUUID()}_thumb.jpg`   : null;
          const previewKey = preview ? `${randomUUID()}_preview.jpg` : null;

          const { saveFile } = await import('../../../../storage/storage-service.js');
          if (thumb && thumbKey) {
            await saveFile({ buffer: thumb.buffer, originalName: `thumb_${file.originalname}`, mimeType: thumb.mimeType, bucket: PHOTO_BUCKET, storageKey: thumbKey, skipValidation: true });
          }
          if (preview && previewKey) {
            await saveFile({ buffer: preview.buffer, originalName: `preview_${file.originalname}`, mimeType: preview.mimeType, bucket: PHOTO_BUCKET, storageKey: previewKey, skipValidation: true });
          }
          await db.execute(sql`
            UPDATE job_photos SET
              thumbnail_key        = ${thumbKey},
              thumbnail_mime_type  = ${thumb   ? thumb.mimeType   : null},
              thumbnail_size_bytes = ${thumb   ? thumb.buffer.length : null},
              preview_key          = ${previewKey},
              preview_mime_type    = ${preview ? preview.mimeType : null},
              preview_size_bytes   = ${preview ? preview.buffer.length : null}
            WHERE id = ${photoId}
          `);
        } catch (thumbErr) {
          console.error(`[photos POST] thumbnail generation failed for photoId=${photoId}:`, thumbErr instanceof Error ? thumbErr.message : thumbErr);
        }
      });
    }

    return res.status(201).json({ photos: saved });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const status = (error as { status?: number }).status ?? 500;
    console.error(`[photos POST] jobId=${req.params.id} unhandled error status=${status}:`, msg);
    return res.status(status).json({ error: msg || 'Failed to upload photos' });
  }
}
