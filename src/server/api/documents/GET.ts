/**
 * GET /api/documents
 * ─────────────────────────────────────────────────────────────────────────────
 * List documents for the authenticated company.
 * Query params: jobId, documentType, status, limit, offset
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
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

    const { jobId, documentType, status, limit = '50', offset = '0' } = req.query as Record<string, string>;

    const conditions: string[] = [`d.company_id = ${profile.companyId}`];
    if (jobId) conditions.push(`d.job_id = ${parseInt(jobId, 10)}`);
    if (documentType) conditions.push(`d.document_type = '${documentType.replace(/'/g, '')}'`);
    if (status) conditions.push(`d.status = '${status.replace(/'/g, '')}'`);

    const where = conditions.join(' AND ');
    const lim = Math.min(parseInt(limit, 10) || 50, 200);
    const off = parseInt(offset, 10) || 0;

    const [rows] = await db.execute(
      sql.raw(`
        SELECT d.id, d.company_id, d.job_id, d.fleet_asset_id, d.customer_id,
               d.source_module, d.source_id, d.document_type, d.title, d.status,
               d.version, d.is_locked, d.locked_at, d.completed_at, d.pdf_file_id,
               d.created_by_user_id, d.updated_by_user_id, d.created_at, d.updated_at,
               j.name as job_name, j.job_number,
               (SELECT COUNT(*) FROM document_shares ds WHERE ds.document_id = d.id AND ds.revoked_at IS NULL) as active_share_count
        FROM documents d
        LEFT JOIN jobs j ON j.id = d.job_id
        WHERE ${where}
        ORDER BY d.updated_at DESC
        LIMIT ${lim} OFFSET ${off}
      `)
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({ documents: rows ?? [] });
  } catch (err) {
    console.error('GET /api/documents error:', err);
    res.status(500).json({ error: 'Failed to load documents' });
  }
}
