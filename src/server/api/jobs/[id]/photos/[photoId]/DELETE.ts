import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobPhotos, profiles, jobs } from '../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { unlink } from 'node:fs/promises';
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

    // Ownership check via job
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

    // Delete file from disk
    try {
      await unlink(join(PHOTO_DIR, photo.filename));
    } catch {
      // File may already be gone — continue with DB delete
    }

    await db.delete(jobPhotos).where(eq(jobPhotos.id, photoId));

    res.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/jobs/:id/photos/:photoId error:', error);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
}
