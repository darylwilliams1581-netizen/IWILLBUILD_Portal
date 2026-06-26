import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { companyFiles, profiles, jobs, user } from '../../../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

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
    const jobId = parseInt(req.params['id'] as string, 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid ID' });
    const job = await db.query.jobs.findFirst({ where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)) });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const rows = await db
      .select({ id: companyFiles.id, companyId: companyFiles.companyId,
        jobId: companyFiles.jobId, fleetAssetId: companyFiles.fleetAssetId,
        uploadedByUserId: companyFiles.uploadedByUserId, uploaderName: user.name,
        originalName: companyFiles.originalName, storedName: companyFiles.storedName,
        mimeType: companyFiles.mimeType, sizeBytes: companyFiles.sizeBytes,
        fileCategory: companyFiles.fileCategory, label: companyFiles.label,
        notes: companyFiles.notes, createdAt: companyFiles.createdAt })
      .from(companyFiles)
      .leftJoin(user, eq(companyFiles.uploadedByUserId, user.id))
      .where(and(eq(companyFiles.companyId, profile.companyId), eq(companyFiles.jobId, jobId)))
      .orderBy(desc(companyFiles.createdAt));
    res.json({ files: rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
}
