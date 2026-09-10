/**
 * DELETE /api/owner-console/sources/documents/:id
 * Permanently deletes a document_template source record.
 * Access: platform_role = 'developer'
 * Does NOT delete library_items or installed company copies.
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
      SELECT id, name FROM document_templates WHERE id = ${id} LIMIT 1
    `) as unknown as [Array<{ id: number; name: string }>, unknown];
    if (!rows?.[0]) return res.status(404).json({ error: 'Template not found' });

    await db.execute(sql`DELETE FROM document_templates WHERE id = ${id}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/owner-console/sources/documents/:id error:', err);
    return res.status(500).json({ error: 'Failed to delete document template' });
  }
}
