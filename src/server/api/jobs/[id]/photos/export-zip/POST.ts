/**
 * POST /api/jobs/:id/photos/export-zip
 * Stream a ZIP archive of all (or selected) job photos.
 * Body: { photoIds?: number[] }  — omit for all photos
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobPhotos, profiles, jobs } from '../../../../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { getDownloadStream, BUCKET_JOB_PHOTOS } from '../../../../../storage/storage-service.js';
import archiver from 'archiver';

export default async function handler(req: Request, res: Response) {
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

    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const { photoIds } = req.body as { photoIds?: number[] };

    let rows;
    if (photoIds && photoIds.length > 0) {
      rows = await db.select().from(jobPhotos).where(
        and(
          eq(jobPhotos.jobId, jobId),
          eq(jobPhotos.companyId, profile.companyId),
          inArray(jobPhotos.id, photoIds)
        )
      );
    } else {
      rows = await db.select().from(jobPhotos).where(
        and(eq(jobPhotos.jobId, jobId), eq(jobPhotos.companyId, profile.companyId))
      );
    }

    if (rows.length === 0) return res.status(404).json({ error: 'No photos found' });

    const safeName = (job.name ?? `job-${jobId}`).replace(/[^a-z0-9_-]/gi, '_').slice(0, 40);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}-photos.zip"`);

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.on('error', (err) => {
      console.error('ZIP archive error:', err);
      if (!res.headersSent) res.end();
    });
    archive.pipe(res);

    for (const photo of rows) {
      try {
        const { stream } = await getDownloadStream(photo.filename, BUCKET_JOB_PHOTOS);
        const ext = photo.mimeType === 'image/png' ? 'png'
          : photo.mimeType === 'image/webp' ? 'webp'
          : 'jpg';
        const name = photo.originalName ?? `photo-${photo.id}.${ext}`;
        archive.append(stream as NodeJS.ReadableStream, { name });
      } catch (e) {
        console.warn(`ZIP: skipping photo ${photo.id}:`, e);
      }
    }

    await archive.finalize();
  } catch (error) {
    console.error('POST /api/jobs/:id/photos/export-zip error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Export failed' });
  }
}
