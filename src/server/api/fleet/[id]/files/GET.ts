import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { companyFiles, profiles, fleetAssets, user } from '../../../../db/schema.js';
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
    const assetId = parseInt(req.params.id, 10);
    if (isNaN(assetId)) return res.status(400).json({ error: 'Invalid ID' });
    const job = await db.query.fleetAssets.findFirst({ where: and(eq(fleetAssets.id, assetId), eq(fleetAssets.companyId, profile.companyId)) });
    if (!job) return res.status(404).json({ error: 'Asset not found' });
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
      .where(and(eq(companyFiles.companyId, profile.companyId), eq(companyFiles.fleetAssetId, assetId)))
      .orderBy(desc(companyFiles.createdAt));
    res.json({ files: rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed' }); }
}
