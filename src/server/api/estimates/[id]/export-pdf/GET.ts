/** GET /api/estimates/:id/export-pdf - stream the canonical quote PDF. */
import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { buildEstimatePdfDocument } from '../../../../lib/estimate-pdf-document.js';
import { getAuth } from '../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const estimateId = Number(req.params.id);
    if (!Number.isInteger(estimateId)) return res.status(400).json({ error: 'Invalid estimate ID' });

    const document = await buildEstimatePdfDocument(profile.companyId, estimateId);
    if (!document) return res.status(404).json({ error: 'Estimate not found' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${document.filename}"`);
    res.setHeader('Content-Length', document.pdfBytes.length);
    res.end(Buffer.from(document.pdfBytes));
  } catch (error) {
    console.error('GET /api/estimates/:id/export-pdf error:', error);
    res.status(500).json({ error: 'Failed to generate estimate PDF' });
  }
}
