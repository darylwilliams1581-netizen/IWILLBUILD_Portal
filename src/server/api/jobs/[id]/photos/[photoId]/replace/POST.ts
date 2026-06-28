import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { jobPhotos, profiles, jobs } from '../../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import {
  compressImageIfNeeded,
  saveFile,
  deleteFile,
  ALLOWED_IMAGE_MIMES,
} from '../../../../../../storage/storage-service.js';

const PHOTO_BUCKET = 'job-photos';

// ── Multer (memory storage) ───────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = Object.keys(ALLOWED_IMAGE_MIMES);
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`UNSUPPORTED_TYPE:${file.originalname}`));
  },
}).single('photo');

export default async function handler(req: Request, res: Response) {
  // Run multer
  let multerError: unknown = null;
  await new Promise<void>((resolve) => {
    upload(req, res, (err: unknown) => {
      if (err) multerError = err;
      resolve();
    });
  });

  if (multerError) {
    const msg = multerError instanceof Error ? multerError.message : String(multerError);
    if (msg.startsWith('UNSUPPORTED_TYPE:')) {
      const name = msg.replace('UNSUPPORTED_TYPE:', '');
      return res.status(400).json({ error: `"${name}" is not a supported type. Use JPEG, PNG, or WebP.` });
    }
    return res.status(400).json({ error: msg });
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
    const photoId = parseInt(String(req.params.photoId), 10);
    if (isNaN(jobId) || isNaN(photoId)) return res.status(400).json({ error: 'Invalid ID' });

    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const photo = await db.query.jobPhotos.findFirst({
      where: and(
        eq(jobPhotos.id, photoId),
        eq(jobPhotos.jobId, jobId),
        eq(jobPhotos.companyId, profile.companyId),
      ),
    });
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // Compress via storage service
    const { buffer: compressed, mimeType: outMime } = await compressImageIfNeeded(
      file.buffer,
      file.mimetype,
    );

    const ext = outMime === 'image/png' ? 'png' : 'jpg';
    const storageKey = `${randomUUID()}.${ext}`;

    // Save new file via storage service
    const result = await saveFile({
      buffer: compressed,
      originalName: file.originalname,
      mimeType: outMime,
      bucket: PHOTO_BUCKET,
      storageKey,
    });

    // Delete old file (best-effort)
    await deleteFile(photo.filename, PHOTO_BUCKET);

    // Update DB
    await db.update(jobPhotos).set({
      filename: result.storageKey,
      originalName: file.originalname,
      mimeType: outMime,
      sizeBytes: result.sizeBytes,
    }).where(eq(jobPhotos.id, photoId));

    const updated = await db.query.jobPhotos.findFirst({ where: eq(jobPhotos.id, photoId) });
    res.json({ ok: true, photo: updated });
  } catch (error) {
    console.error('POST replace error:', error);
    res.status(500).json({ error: 'Failed to replace photo' });
  }
}
