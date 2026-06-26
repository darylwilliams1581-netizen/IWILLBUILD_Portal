import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { companyFiles, profiles, user } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

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

    const rows = await db
      .select({
        id: companyFiles.id,
        companyId: companyFiles.companyId,
        jobId: companyFiles.jobId,
        fleetAssetId: companyFiles.fleetAssetId,
        uploadedByUserId: companyFiles.uploadedByUserId,
        uploaderName: user.name,
        originalName: companyFiles.originalName,
        storedName: companyFiles.storedName,
        mimeType: companyFiles.mimeType,
        sizeBytes: companyFiles.sizeBytes,
        fileCategory: companyFiles.fileCategory,
        label: companyFiles.label,
        notes: companyFiles.notes,
        createdAt: companyFiles.createdAt,
      })
      .from(companyFiles)
      .leftJoin(user, eq(companyFiles.uploadedByUserId, user.id))
      .where(eq(companyFiles.companyId, profile.companyId))
      .orderBy(desc(companyFiles.createdAt));

    res.json({ files: rows });
  } catch (err) {
    console.error('GET /api/files error:', err);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
}
