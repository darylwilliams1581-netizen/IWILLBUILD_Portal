/**
 * DELETE /api/owner-console/sources/swms/:id
 * Permanently deletes a swms_template source record.
 * Access: platform_role = 'developer'
 * Refuses if active job SWMS records reference this template.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../../lib/platform-owner-guard.js';

export default async function handler(req: Request, res: Response) {
  try {
    const info = await getPlatformOwnerInfo(req);
    if (!info) return res.status(401).json({ error: 'Unauthorised' });
    if (!info.isPlatformOwner) return res.status(403).json({ error: 'Platform developer access required' });

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid ID' });

    // Verify template exists
    const [rows] = await db.execute(sql`
      SELECT id, title FROM swms_templates WHERE id = ${id} LIMIT 1
    `) as unknown as [Array<{ id: number; title: string }>, unknown];
    if (!rows?.[0]) return res.status(404).json({ error: 'Template not found' });

    // Refuse if active job SWMS records exist
    try {
      const [jobRows] = await db.execute(sql`
        SELECT COUNT(*) AS cnt FROM job_swms
        WHERE template_id = ${id} AND status NOT IN ('archived', 'deleted')
        LIMIT 1
      `) as unknown as [Array<{ cnt: number }>, unknown];
      const activeCount = Number(jobRows?.[0]?.cnt ?? 0);
      if (activeCount > 0) {
        return res.status(409).json({
          error: `Cannot delete — used in ${activeCount} active job SWMS record(s). Archive instead.`,
        });
      }
    } catch {
      // Table may not exist yet — proceed with delete
    }

    await db.execute(sql`DELETE FROM swms_templates WHERE id = ${id}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/owner-console/sources/swms/:id error:', err);
    return res.status(500).json({ error: 'Failed to delete SWMS template' });
  }
}
