import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { jobPhotos, profiles, jobs } from '../../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';

const PHOTO_DIR = '/shared-storage/public/assets/job-photos';

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

    const filePath = join(PHOTO_DIR, photo.filename);
    const downloadName = photo.originalName ?? photo.filename;

    res.setHeader('Content-Type', photo.mimeType ?? 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);

    const stream = createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'File not found on disk' });
    });
    stream.pipe(res);
  } catch (error) {
    console.error('GET /api/jobs/:id/photos/:photoId/download error:', error);
    res.status(500).json({ error: 'Failed to download photo' });
  }
}
