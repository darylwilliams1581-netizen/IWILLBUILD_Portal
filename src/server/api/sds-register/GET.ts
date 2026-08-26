/**
 * GET /api/sds-register
 * ─────────────────────────────────────────────────────────────────────────────
 * List all SDS/MSDS entries for the authenticated user's company.
 * Company-scoped — never returns another company's records.
 * Archived entries are excluded by default; pass ?archived=1 to include them.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
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

    const includeArchived = req.query['archived'] === '1';
    const archivedClause = includeArchived ? '' : 'AND s.archived_at IS NULL';

    const [rows] = await db.execute(sql.raw(`
      SELECT
        s.id,
        s.company_id        AS companyId,
        s.title,
        s.product_name      AS productName,
        s.manufacturer,
        s.original_name     AS originalName,
        s.stored_name       AS storedName,
        s.mime_type         AS mimeType,
        s.size_bytes        AS sizeBytes,
        s.notes,
        s.archived_at       AS archivedAt,
        s.replaced_by_id    AS replacedById,
        s.replaced_at       AS replacedAt,
        s.replaced_by_user_id AS replacedByUserId,
        s.uploaded_by_user_id AS uploadedByUserId,
        u.name              AS uploaderName,
        s.created_at        AS createdAt,
        s.updated_at        AS updatedAt
      FROM sds_register s
      LEFT JOIN user u ON u.id = s.uploaded_by_user_id
      WHERE s.company_id = ${profile.companyId}
        ${archivedClause}
      ORDER BY s.created_at DESC
    `)) as unknown as [Array<Record<string, unknown>>];

    return res.json({ entries: rows ?? [] });
  } catch (err) {
    console.error('GET /api/sds-register error:', err);
    return res.status(500).json({ error: 'Failed to fetch SDS register' });
  }
}
