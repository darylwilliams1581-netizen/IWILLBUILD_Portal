import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { companyFiles, profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';

const FDIR = '/shared-storage/public/assets/company-files';

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
    const fileId = parseInt(req.params.id, 10);
    if (isNaN(fileId)) return res.status(400).json({ error: 'Invalid ID' });
    const record = await db.query.companyFiles.findFirst({ where: eq(companyFiles.id, fileId) });
    if (!record || record.companyId !== profile.companyId) return res.status(404).json({ error: 'File not found' });
    const filePath = join(FDIR, record.storedName);
    res.setHeader('Content-Type', record.mimeType);
    res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(record.originalName) + '"');
    res.setHeader('Content-Length', record.sizeBytes);
    const stream = createReadStream(filePath);
    stream.on('error', () => { if (!res.headersSent) res.status(404).json({ error: 'File not found on disk' }); });
    stream.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to download file' });
  }
}
