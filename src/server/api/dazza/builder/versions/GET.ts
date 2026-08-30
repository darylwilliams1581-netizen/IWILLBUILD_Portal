/**
 * GET /api/dazza/builder/versions?templateId=&builderType=&limit=
 * ─────────────────────────────────────────────────────────────────────────────
 * List version history for a template.
 */
import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const templateId = Number(req.query.templateId);
    const builderType = String(req.query.builderType ?? '');
    const limit = Math.min(Number(req.query.limit ?? 20), 100);

    if (!templateId) return res.status(400).json({ error: 'templateId required' });
    if (!['document', 'form'].includes(builderType)) return res.status(400).json({ error: 'builderType must be "document" or "form"' });

    const rows = await db.execute(sql`
      SELECT id, version_number, instruction_summary, operations_count,
             validation_result, change_source, conversation_id, created_at
      FROM dazza_builder_versions
      WHERE template_id = ${templateId} AND builder_type = ${builderType}
      ORDER BY version_number DESC
      LIMIT ${limit}
    `);

    res.json({ versions: (rows as { rows: unknown[] }).rows ?? [] });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
