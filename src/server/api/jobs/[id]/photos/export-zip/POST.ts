/**
 * POST /api/jobs/:id/photos/export-zip
 * Stream a ZIP archive of all (or selected) photos for a single job.
 * Body: { photoIds?: number[] }  — omit for all photos in the job
 *
 * Uses the shared zip-photo-export helper so ZIP logic is not duplicated.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobPhotos, profiles, jobs } from '../../../../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import {
  buildPhotoZip,
  wholeJobZipFilename,
  todayDateString,
  type PhotoRow,
  type JobMeta,
} from '../../../../../lib/zip-photo-export.js';

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
      // Deduplicate IDs before querying
      const uniqueIds = [...new Set(photoIds.filter(id => Number.isInteger(id) && id > 0))];
      rows = await db.select().from(jobPhotos).where(
        and(
          eq(jobPhotos.jobId, jobId),
          eq(jobPhotos.companyId, profile.companyId),
          inArray(jobPhotos.id, uniqueIds),
        )
      );
    } else {
      rows = await db.select().from(jobPhotos).where(
        and(eq(jobPhotos.jobId, jobId), eq(jobPhotos.companyId, profile.companyId))
      );
    }

    if (rows.length === 0) return res.status(404).json({ error: 'No photos found' });

    const photoRowsTyped: PhotoRow[] = rows.map(r => ({
      id:           r.id,
      jobId:        r.jobId,
      filename:     r.filename,
      originalName: r.originalName ?? null,
      mimeType:     r.mimeType ?? null,
    }));

    const jobMeta: JobMeta = {
      id:        job.id,
      name:      job.name ?? null,
      jobNumber: job.jobNumber ?? null,
    };

    const zipBuffer  = await buildPhotoZip(photoRowsTyped, new Map([[job.id, jobMeta]]), false);
    const zipFilename = wholeJobZipFilename(jobMeta, todayDateString());

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
    res.setHeader('Content-Length', zipBuffer.length);
    res.end(zipBuffer);
  } catch (error) {
    console.error('POST /api/jobs/:id/photos/export-zip error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Export failed' });
  }
}
