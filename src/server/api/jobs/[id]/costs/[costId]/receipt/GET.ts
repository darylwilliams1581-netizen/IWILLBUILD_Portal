/**
 * GET /api/jobs/:id/costs/:costId/receipt
 * Download a cost receipt through an authenticated route.
 * Verifies the cost belongs to the requesting user's company before streaming.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../../db/schema.js';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';

const RECEIPT_DIR = '/shared-storage/public/assets/uploads/receipts';

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
    const costId = parseInt(String(req.params.costId), 10);
    if (isNaN(jobId) || isNaN(costId)) return res.status(400).json({ error: 'Invalid ID' });

    // Fetch cost + linked file in one query, enforcing company ownership
    const [rows] = await db.execute(sql`
      SELECT jc.id, jc.receipt_file_id, jf.stored_name, jf.original_name, jf.mime_type
      FROM job_costs jc
      LEFT JOIN job_files jf ON jf.id = jc.receipt_file_id
      WHERE jc.id = ${costId}
        AND jc.job_id = ${jobId}
        AND jc.company_id = ${profile.companyId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    const cost = rows?.[0];
    if (!cost) return res.status(404).json({ error: 'Cost not found' });
    if (!cost.receipt_file_id || !cost.stored_name) {
      return res.status(404).json({ error: 'No receipt attached to this cost' });
    }

    const filePath = join(RECEIPT_DIR, String(cost.stored_name));
    const mimeType = String(cost.mime_type ?? 'application/octet-stream');
    const originalName = String(cost.original_name ?? cost.stored_name);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);

    const stream = createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: 'Receipt file not found on disk' });
    });
    stream.pipe(res);
  } catch (err) {
    console.error('GET /api/jobs/:id/costs/:costId/receipt error:', err);
    res.status(500).json({ error: 'Failed to download receipt' });
  }
}
