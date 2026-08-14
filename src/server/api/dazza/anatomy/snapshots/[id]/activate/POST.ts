/**
 * POST /api/dazza/anatomy/snapshots/:id/activate
 * Platform-owner only. Activates a snapshot (deactivates all others).
 * Only 'ready' snapshots may be activated.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const { id } = req.params;
  if (!id) { res.status(400).json({ error: 'Missing id' }); return; }

  // Verify snapshot exists and is ready
  const [rows] = await db.execute(sql.raw(`
    SELECT id, status FROM anatomy_snapshots
    WHERE id = '${id.replace(/'/g, "''")}' AND status != 'deleted'
    LIMIT 1
  `)) as unknown as [Array<{ id: string; status: string }>, unknown];

  if (!rows?.length) {
    res.status(404).json({ error: 'Snapshot not found' });
    return;
  }
  if (rows[0].status !== 'ready') {
    res.status(400).json({ error: `Cannot activate snapshot with status '${rows[0].status}'. Must be 'ready'.` });
    return;
  }

  // Deactivate all, then activate this one
  await db.execute(sql`UPDATE anatomy_snapshots SET is_active = 0, updated_at = NOW() WHERE is_active = 1`);
  await db.execute(sql.raw(`
    UPDATE anatomy_snapshots SET is_active = 1, updated_at = NOW()
    WHERE id = '${id.replace(/'/g, "''")}'
  `));

  res.json({ ok: true, snapshotId: id, isActive: true });
}
