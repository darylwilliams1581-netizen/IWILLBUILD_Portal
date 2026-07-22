import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobPhotos, profiles, jobs } from '../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { getSignedUrl, saveFile, getDownloadStream } from '../../../../../storage/storage-service.js';

const PHOTO_BUCKET = 'job-photos';

// ── Jimp lazy-loaded ──────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _CustomJimp: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _JimpMime: any = null;

async function getJimp() {
  if (_CustomJimp) return { CustomJimp: _CustomJimp, JimpMime: _JimpMime };
  const [core, jimpPkg, resizePkg] = await Promise.all([
    import('@jimp/core'),
    import('jimp'),
    import('@jimp/plugin-resize'),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createJimp = (core as any).createJimp;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { defaultPlugins, defaultFormats, JimpMime } = jimpPkg as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resizeMethods = (resizePkg as any).methods;
  _JimpMime = JimpMime;
  _CustomJimp = createJimp({ plugins: [...defaultPlugins, resizeMethods], formats: defaultFormats });
  return { CustomJimp: _CustomJimp, JimpMime: _JimpMime };
}

/** Stream → Buffer helper */
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

export default async function handler(req: Request, res: Response) {
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

    // Ownership check
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

    const { label, rotate } = req.body as { label?: string; rotate?: 'left' | 'right' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {};

    // ── Label update ──────────────────────────────────────────────────────────
    if (typeof label === 'string') {
      updates.label = label.trim() || null;
    }

    // ── Rotation (download from storage, rotate, re-upload) ───────────────────
    if (rotate === 'left' || rotate === 'right') {
      const mime = photo.mimeType ?? 'image/jpeg';

      if (mime === 'image/heic' || mime === 'image/heif') {
        return res.status(400).json({ error: 'HEIC/HEIF rotation is not supported.' });
      }

      // Download current file from storage
      const { stream } = await getDownloadStream(photo.filename, PHOTO_BUCKET);
      const buffer = await streamToBuffer(stream);

      const { CustomJimp, JimpMime } = await getJimp();
      const img = await CustomJimp.read(buffer);

      // Jimp rotate: positive = counter-clockwise, negative = clockwise
      const degrees = rotate === 'left' ? 90 : -90;
      img.rotate(degrees);

      const outputMime = mime === 'image/png' ? JimpMime.png : JimpMime.jpeg;
      const outBuffer: Buffer = await img.getBuffer(outputMime, mime !== 'image/png' ? { quality: 82 } : undefined);

      // Re-upload to same key (overwrites in place)
      await saveFile({
        buffer: outBuffer,
        originalName: photo.originalName ?? photo.filename,
        mimeType: mime,
        bucket: PHOTO_BUCKET,
        storageKey: photo.filename,
      });

      updates.sizeBytes = outBuffer.length;
    }

    // ── Persist ───────────────────────────────────────────────────────────────
    if (Object.keys(updates).length > 0) {
      await db.update(jobPhotos).set(updates).where(eq(jobPhotos.id, photoId));
    }

    // Return updated record with a fresh signed URL
    const updated = await db.query.jobPhotos.findFirst({
      where: eq(jobPhotos.id, photoId),
    });

    let url: string | null = null;
    try {
      url = await getSignedUrl(photo.filename, PHOTO_BUCKET, 3600);
    } catch { /* best-effort */ }

    res.json({ ok: true, photo: { ...updated, url } });
  } catch (error) {
    console.error('PATCH /api/jobs/:id/photos/:photoId error:', error);
    res.status(500).json({ error: 'Failed to update photo' });
  }
}
