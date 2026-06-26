import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { jobPhotos, profiles, jobs } from '../../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';

const PHOTO_DIR = '/shared-storage/public/assets/job-photos';

// ── Multer (memory storage) ───────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`UNSUPPORTED_TYPE:${file.originalname}`));
  },
}).single('photo');

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

    // Compress with Jimp (max 1920px, JPEG 82%)
    const { CustomJimp, JimpMime } = await getJimp();
    const img = await CustomJimp.read(file.buffer);
    if (img.width > 1920 || img.height > 1920) {
      if (img.width >= img.height) img.resize({ w: 1920 });
      else img.resize({ h: 1920 });
    }
    const isPng = file.mimetype === 'image/png';
    const outMime = isPng ? JimpMime.png : JimpMime.jpeg;
    const compressed: Buffer = await img.getBuffer(outMime, !isPng ? { quality: 82 } : undefined);

    // Write new file
    const newFilename = `${randomUUID()}.${isPng ? 'png' : 'jpg'}`;
    await writeFile(join(PHOTO_DIR, newFilename), compressed);

    // Delete old file (best-effort)
    try { await unlink(join(PHOTO_DIR, photo.filename)); } catch { /* ignore */ }

    // Update DB
    await db.update(jobPhotos).set({
      filename: newFilename,
      originalName: file.originalname,
      mimeType: isPng ? 'image/png' : 'image/jpeg',
      sizeBytes: compressed.length,
    }).where(eq(jobPhotos.id, photoId));

    const updated = await db.query.jobPhotos.findFirst({ where: eq(jobPhotos.id, photoId) });
    res.json({ ok: true, photo: updated });
  } catch (error) {
    console.error('POST replace error:', error);
    res.status(500).json({ error: 'Failed to replace photo' });
  }
}
