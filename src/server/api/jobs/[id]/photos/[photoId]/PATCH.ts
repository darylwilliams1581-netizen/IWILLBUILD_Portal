import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobPhotos, profiles, jobs } from '../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const PHOTO_DIR = '/shared-storage/public/assets/job-photos';

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

    // ── Rotation ──────────────────────────────────────────────────────────────
    if (rotate === 'left' || rotate === 'right') {
      const mime = photo.mimeType ?? 'image/jpeg';

      // Reject HEIC/HEIF
      if (mime === 'image/heic' || mime === 'image/heif') {
        return res.status(400).json({ error: 'HEIC/HEIF rotation is not supported.' });
      }

      const filePath = join(PHOTO_DIR, photo.filename);
      const buffer = await readFile(filePath);

      const { CustomJimp, JimpMime } = await getJimp();
      const img = await CustomJimp.read(buffer);

      // Jimp rotate: positive = counter-clockwise, negative = clockwise
      // "rotate left" = 90° counter-clockwise = +90 in Jimp
      // "rotate right" = 90° clockwise = -90 in Jimp
      const degrees = rotate === 'left' ? 90 : -90;
      img.rotate(degrees);

      const outputMime = mime === 'image/png' ? JimpMime.png : JimpMime.jpeg;
      const outBuffer: Buffer = await img.getBuffer(outputMime, mime !== 'image/png' ? { quality: 82 } : undefined);

      await writeFile(filePath, outBuffer);
      updates.sizeBytes = outBuffer.length;
    }

    // ── Persist ───────────────────────────────────────────────────────────────
    if (Object.keys(updates).length > 0) {
      await db.update(jobPhotos).set(updates).where(eq(jobPhotos.id, photoId));
    }

    // Return updated record
    const updated = await db.query.jobPhotos.findFirst({
      where: eq(jobPhotos.id, photoId),
    });

    res.json({ ok: true, photo: updated });
  } catch (error) {
    console.error('PATCH /api/jobs/:id/photos/:photoId error:', error);
    res.status(500).json({ error: 'Failed to update photo' });
  }
}
