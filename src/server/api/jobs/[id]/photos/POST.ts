import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { jobPhotos, profiles, jobs } from '../../../../db/schema.js';
import { eq, and, count, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { getPlanLimits, getCompanyPlan, checkLimit } from '../../../../lib/plan-limits.js';
import { randomUUID } from 'node:crypto';
import { parseMultipartForm } from '../../../../lib/file-upload.js';
import {
  validateBatch,
  compressImageIfNeeded,
  generateThumbnail,
  generatePreview,
  getImageDimensions,
  saveFile,
  ALLOWED_IMAGE_MIMES,
} from '../../../../storage/storage-service.js';

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

  // ── Diagnostic logging — visible in server logs for iOS debugging ─────────
  console.log(`[photos POST] jobId=${req.params.id} files=${parsed.files.length} fields=${JSON.stringify(Object.keys(parsed.fields))}`);
  for (const f of parsed.files) {
    console.log(`[photos POST] file: name="${f.originalname}" mime="${f.mimetype}" size=${f.size} field="${f.fieldname}"`);
  }

  // ── MIME reclassification ─────────────────────────────────────────────────
  // iOS Safari sends HEIC as application/octet-stream or image/heic.
  // Some iOS versions send files with no extension (originalname = "image").
  // Reclassify by extension first, then fall back to magic-byte sniffing.
  for (const f of parsed.files) {
    const ext = (f.originalname.split('.').pop() ?? '').toLowerCase();
    const noExt = !f.originalname.includes('.') || ext === f.originalname.toLowerCase();

    // Reclassify blank / octet-stream by extension
    if (f.mimetype === 'application/octet-stream' || f.mimetype === '' || f.mimetype === 'application/unknown') {
      if (ext === 'heic' || ext === 'heif') f.mimetype = 'image/heic';
      else if (ext === 'jpg' || ext === 'jpeg') f.mimetype = 'image/jpeg';
      else if (ext === 'png') f.mimetype = 'image/png';
      else if (ext === 'webp') f.mimetype = 'image/webp';
      else if (noExt && f.buffer.length > 3) {
        // Magic-byte sniff for files with no extension (iOS "image" filename)
        const sig = f.buffer.slice(0, 12);
        if (sig[0] === 0xFF && sig[1] === 0xD8) f.mimetype = 'image/jpeg';          // JPEG
        else if (sig[0] === 0x89 && sig[1] === 0x50) f.mimetype = 'image/png';      // PNG
        else if (sig[0] === 0x52 && sig[1] === 0x49) f.mimetype = 'image/webp';     // RIFF/WebP
        else f.mimetype = 'image/jpeg'; // safe default for iOS camera output
      }
    }
    // Normalise non-standard aliases
    if (f.mimetype === 'image/jpg') f.mimetype = 'image/jpeg';
    // iOS sometimes sends HEIC as image/heif — normalise to image/heic
    if (f.mimetype === 'image/heif') f.mimetype = 'image/heic';

    console.log(`[photos POST] after reclassify: name="${f.originalname}" mime="${f.mimetype}"`);

    if (!ALLOWED_IMAGE_MIMES[f.mimetype]) {
      console.warn(`[photos POST] rejected: name="${f.originalname}" mime="${f.mimetype}"`);
      return res.status(400).json({
        code: 'invalid_file_type',
        error: `"${f.originalname}" is not a supported image type (${f.mimetype}). Supported: JPEG, PNG, WebP, HEIC.`,
      });
    }
  }

  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const jobId = parseInt(String(req.params.id), 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const files = parsed.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // ── Centralised batch validation ──────────────────────────────────────────
    const batchValidation = validateBatch(files.map(f => ({
      originalname: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
    })), { isImage: true });
    if (!batchValidation.ok) {
      return res.status(400).json({ code: batchValidation.code, error: batchValidation.error });
    }

    // ── Per-job photo limit ───────────────────────────────────────────────────
    const [photoCountRow] = await db
      .select({ c: count() })
      .from(jobPhotos)
      .where(and(eq(jobPhotos.jobId, jobId), eq(jobPhotos.companyId, profile.companyId)));
    const currentCount = photoCountRow?.c ?? 0;

    if (currentCount >= MAX_PHOTOS_PER_JOB) {
      return res.status(400).json({
        code: 'limit_reached',
        error: `This job has reached the ${MAX_PHOTOS_PER_JOB}-photo limit. Delete some photos before uploading more.`,
      });
    }
    if (currentCount + files.length > MAX_PHOTOS_PER_JOB) {
      const remaining = MAX_PHOTOS_PER_JOB - currentCount;
      return res.status(400).json({
        code: 'limit_reached',
        error: `Only ${remaining} photo${remaining === 1 ? '' : 's'} can be added before reaching the ${MAX_PHOTOS_PER_JOB}-photo limit.`,
      });
    }

    // ── Plan-level total photo limit ──────────────────────────────────────────
    const plan = await getCompanyPlan(profile.companyId);
    const limits = await getPlanLimits(profile.companyId, plan);
    const [totalPhotoRow] = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM job_photos WHERE company_id = ${profile.companyId}`
    ) as unknown as [Array<{ cnt: number }>, unknown];
    const totalPhotos = Number(totalPhotoRow?.[0]?.cnt ?? 0);
    const planCheck = checkLimit(totalPhotos, limits.totalPhotos, 'Total Job Photos');
    if (!planCheck.allowed) {
      return res.status(403).json({ code: planCheck.code, error: planCheck.message });
    }

    const label = typeof parsed.fields?.label === 'string' ? parsed.fields.label.trim() : null;
    const uploaderName = session.user.name ?? session.user.email ?? null;
    const uploaderUserId = session.user.id ?? null;

    const saved: Array<{ id: number; filename: string; url: string }> = [];

    for (const file of files) {
      // ── Compress original ──────────────────────────────────────────────────
      let compressed: Buffer = file.buffer;
      let outMime: string = file.mimetype;
      try {
        const result = await compressImageIfNeeded(file.buffer, file.mimetype);
        compressed = result.buffer;
        outMime = result.mimeType;
        console.log(`[photos POST] compress: "${file.originalname}" ${file.mimetype} → ${outMime} (${file.size}→${compressed.length} bytes)`);
      } catch (convErr) {
        console.error(`[photos POST] compress failed: "${file.originalname}"`, convErr);
        return res.status(400).json({
          code: 'conversion_failed',
          error: convErr instanceof Error ? convErr.message : 'Image conversion failed.',
        });
      }

      const ext = outMime === 'image/png' ? 'png' : 'jpg';
      const storageKey = `${randomUUID()}.${ext}`;

      console.log(`[photos POST] saving original: key=${storageKey} bucket=${PHOTO_BUCKET} mime=${outMime}`);
      const result = await saveFile({
        buffer: compressed,
        originalName: file.originalname,
        mimeType: outMime,
        bucket: PHOTO_BUCKET,
        storageKey,
      });
      console.log(`[photos POST] saved original: key=${result.storageKey} url=${result.publicUrl}`);

      // ── Get dimensions from compressed buffer (non-blocking) ──────────────
      let imgWidth: number | null = null;
      let imgHeight: number | null = null;
      try {
        const dims = await getImageDimensions(compressed, outMime);
        if (dims) { imgWidth = dims.width; imgHeight = dims.height; }
      } catch { /* non-fatal */ }

      // ── Insert DB record first so client gets a response quickly ──────────
      const [inserted] = await db.insert(jobPhotos).values({
        jobId,
        companyId: profile.companyId,
        filename: result.storageKey,
        originalName: file.originalname,
        label: label || null,
        mimeType: outMime,
        sizeBytes: result.sizeBytes,
        imageWidth: imgWidth,
        imageHeight: imgHeight,
        uploadedByUserId: uploaderUserId,
        uploadedByName: uploaderName,
      }).$returningId();
      console.log(`[photos POST] DB record inserted: id=${inserted.id} jobId=${jobId}`);

      saved.push({
        id: inserted.id,
        filename: result.storageKey,
        url: result.publicUrl,
      });

      // ── Generate thumbnail + preview asynchronously (non-blocking) ────────
      // Fire-and-forget: upload response is already sent; thumbnails are
      // generated in the background and the DB record is updated when done.
      const photoId = inserted.id;
      const srcBuffer = compressed;
      const srcMime = outMime;
      setImmediate(async () => {
        try {
          const [thumb, preview] = await Promise.all([
            generateThumbnail(srcBuffer, srcMime),
            generatePreview(srcBuffer, srcMime),
          ]);

          const thumbKey = thumb ? `${randomUUID()}_thumb.jpg` : null;
          const previewKey = preview ? `${randomUUID()}_preview.jpg` : null;

          if (thumb && thumbKey) {
            await saveFile({
              buffer: thumb.buffer,
              originalName: `thumb_${file.originalname}`,
              mimeType: thumb.mimeType,
              bucket: PHOTO_BUCKET,
              storageKey: thumbKey,
            });
            console.log(`[photos POST] thumbnail saved: key=${thumbKey} size=${thumb.buffer.length}`);
          }

          if (preview && previewKey) {
            await saveFile({
              buffer: preview.buffer,
              originalName: `preview_${file.originalname}`,
              mimeType: preview.mimeType,
              bucket: PHOTO_BUCKET,
              storageKey: previewKey,
            });
            console.log(`[photos POST] preview saved: key=${previewKey} size=${preview.buffer.length}`);
          }

          // Update DB with thumbnail/preview keys
          await db.execute(sql`
            UPDATE job_photos SET
              thumbnail_key        = ${thumbKey},
              thumbnail_mime_type  = ${thumb ? thumb.mimeType : null},
              thumbnail_size_bytes = ${thumb ? thumb.buffer.length : null},
              preview_key          = ${previewKey},
              preview_mime_type    = ${preview ? preview.mimeType : null},
              preview_size_bytes   = ${preview ? preview.buffer.length : null}
            WHERE id = ${photoId}
          `);
          console.log(`[photos POST] thumbnail/preview DB updated: photoId=${photoId} thumb=${!!thumbKey} preview=${!!previewKey}`);
        } catch (thumbErr) {
          console.error(`[photos POST] thumbnail generation failed for photoId=${photoId}:`, thumbErr instanceof Error ? thumbErr.message : thumbErr);
          // Non-fatal — original is already saved and accessible
        }
      });
    }

    res.status(201).json({ photos: saved });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('POST /api/jobs/:id/photos error:', msg);
    res.status(500).json({ error: msg || 'Failed to upload photos' });
  }
}
