/**
 * GET /api/sds-register/:id/download
 * ─────────────────────────────────────────────────────────────────────────────
 * Stream the PDF for viewing or download.
 * All authenticated company members can access (workers need to read SDS on-site).
 * Pass ?inline=1 to open in browser; default is attachment (download).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { getDownloadStream, BUCKET_COMPANY_FILES } from '../../../../storage/storage-service.js';

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

    const entryId = parseInt(req.params['id'] as string, 10);
    if (isNaN(entryId)) return res.status(400).json({ error: 'Invalid ID' });

    const [rows] = await db.execute(sql.raw(`
      SELECT * FROM sds_register
      WHERE id = ${entryId} AND company_id = ${profile.companyId}
      LIMIT 1
    `)) as unknown as [Array<Record<string, unknown>>];

    const record = rows[0];
    if (!record) return res.status(404).json({ error: 'SDS document not found' });

    const storedName = record['storedName'] as string || record['stored_name'] as string;
    const originalName = record['originalName'] as string || record['original_name'] as string;
    const mimeType = (record['mimeType'] as string || record['mime_type'] as string) ?? 'application/pdf';
    const sizeBytes = Number(record['sizeBytes'] ?? record['size_bytes'] ?? 0);

    const { stream } = await getDownloadStream(storedName, BUCKET_COMPANY_FILES);

    const inline = req.query['inline'] === '1';
    const disposition = inline
      ? `inline; filename="${encodeURIComponent(originalName)}"`
      : `attachment; filename="${encodeURIComponent(originalName)}"`;

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', disposition);
    if (sizeBytes > 0) res.setHeader('Content-Length', String(sizeBytes));

    stream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'File not found in storage' });
    });
    stream.pipe(res);
  } catch (err) {
    console.error('GET /api/sds-register/:id/download error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to download SDS document' });
  }
}
