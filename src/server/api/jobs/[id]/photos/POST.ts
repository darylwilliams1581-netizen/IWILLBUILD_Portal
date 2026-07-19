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

  // Validate image types — HEIC/HEIF now accepted (converted server-side)
  for (const f of parsed.files) {
    if (!ALLOWED_IMAGE_MIMES[f.mimetype]) {
      return res.status(400).json({
        code: 'invalid_file_type',
        error: `"${f.originalname}" is not a supported image type. Please upload JPEG, PNG, or WebP.`,
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
      let compressed: Buffer = file.buffer;
      let outMime: string = file.mimetype;
      try {
        const result = await compressImageIfNeeded(file.buffer, file.mimetype);
        compressed = result.buffer;
        outMime = result.mimeType;
      } catch (convErr) {
        return res.status(400).json({
          code: 'conversion_failed',
          error: convErr instanceof Error ? convErr.message : 'Image conversion failed.',
        });
      }

      const ext = outMime === 'image/png' ? 'png' : 'jpg';
      const storageKey = `${randomUUID()}.${ext}`;

      const result = await saveFile({
        buffer: compressed,
        originalName: file.originalname,
        mimeType: outMime,
        bucket: PHOTO_BUCKET,
        storageKey,
      });

      const [inserted] = await db.insert(jobPhotos).values({
        jobId,
        companyId: profile.companyId,
        filename: result.storageKey,
        originalName: file.originalname,
        label: label || null,
        mimeType: outMime,
        sizeBytes: result.sizeBytes,
        uploadedByUserId: uploaderUserId,
        uploadedByName: uploaderName,
      }).$returningId();

      saved.push({
        id: inserted.id,
        filename: result.storageKey,
        url: result.publicUrl,
      });
    }

    res.status(201).json({ photos: saved });
  } catch (error) {
    console.error('POST /api/jobs/:id/photos error:', error);
    res.status(500).json({ error: 'Failed to upload photos' });
  }
}
