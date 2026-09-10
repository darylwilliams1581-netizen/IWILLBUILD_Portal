/**
 * PATCH /api/owner-console/sources/forms/:id
 * Archive or restore a form_template source record.
 * Body: { status: 'active' | 'archived' }
 * Access: platform_role = 'developer'
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

    const { status } = req.body as { status?: string };
    if (!status || !['active', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'status must be active or archived' });
    }

    await db.execute(sql`
      UPDATE form_templates
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${id}
    `);

    return res.json({ ok: true, status });
  } catch (err) {
    console.error('PATCH /api/owner-console/sources/forms/:id error:', err);
    return res.status(500).json({ error: 'Failed to update form template' });
  }
}
