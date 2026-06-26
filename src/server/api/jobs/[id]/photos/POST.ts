import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { jobPhotos, profiles, jobs } from '../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createJimp } from '@jimp/core';
import { defaultPlugins, defaultFormats, JimpMime } from 'jimp';
import { methods as resizeMethods } from '@jimp/plugin-resize';
import multer from 'multer';

// ── Jimp with resize plugin ───────────────────────────────────────────────────
const CustomJimp = createJimp({
  plugins: [...defaultPlugins, resizeMethods],
  formats: defaultFormats,
});

// ── multer: memory storage, 20 MB per file, max 10 files ─────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`UNSUPPORTED_TYPE:${file.originalname}`));
    }
  },
}).array('photos', 10);

const PHOTO_DIR = '/shared-storage/public/assets/job-photos';
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 82;

async function compressImage(buffer: Buffer, mime: string): Promise<Buffer> {
  try {
    const img = await CustomJimp.read(buffer);
    const { width, height } = img;

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      // Scale down maintaining aspect ratio
      if (width >= height) {
        img.resize({ w: MAX_DIMENSION });
      } else {
        img.resize({ h: MAX_DIMENSION });
      }
    }

    if (mime === 'image/png') {
      return await img.getBuffer(JimpMime.png);
    }
    // JPEG/WebP/GIF → compress as JPEG
    return await img.getBuffer(JimpMime.jpeg, { quality: JPEG_QUALITY });
  } catch {
    // If Jimp can't process it, return original buffer unchanged
    return buffer;
  }
}

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
      return res.status(400).json({
        error: `"${name}" is not a supported image type. Please upload JPEG, PNG, WebP, or GIF. HEIC/HEIF files must be converted first.`,
      });
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
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Reject HEIC/HEIF by original filename extension
    const heicFiles = files.filter((f) => {
      const ext = f.originalname.split('.').pop()?.toLowerCase() ?? '';
      return ext === 'heic' || ext === 'heif';
    });
    if (heicFiles.length > 0) {
      return res.status(400).json({
        error: `HEIC/HEIF files are not supported. Please convert "${heicFiles[0].originalname}" to JPEG or PNG before uploading.`,
      });
    }

    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : null;

    // Ensure storage dir exists
    await mkdir(PHOTO_DIR, { recursive: true });

    const saved: Array<{ id: number; filename: string; url: string }> = [];

    for (const file of files) {
      const ext = file.mimetype === 'image/png' ? 'png' : 'jpg';
      const filename = `${randomUUID()}.${ext}`;
      const filePath = join(PHOTO_DIR, filename);

      const compressed = await compressImage(file.buffer, file.mimetype);
      await writeFile(filePath, compressed);

      const [inserted] = await db.insert(jobPhotos).values({
        jobId,
        companyId: profile.companyId,
        filename,
        originalName: file.originalname,
        label: label || null,
        mimeType: file.mimetype,
        sizeBytes: compressed.length,
      }).$returningId();

      saved.push({
        id: inserted.id,
        filename,
        url: `/airo-assets/uploads/job-photos/${filename}`,
      });
    }

    res.status(201).json({ photos: saved });
  } catch (error) {
    console.error('POST /api/jobs/:id/photos error:', error);
    res.status(500).json({ error: 'Failed to upload photos' });
  }
}
