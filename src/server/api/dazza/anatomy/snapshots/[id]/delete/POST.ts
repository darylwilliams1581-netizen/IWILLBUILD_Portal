/**
 * POST /api/dazza/anatomy/snapshots/:id/delete
 * Platform-owner only. Soft-deletes a snapshot (marks status='deleted', is_active=0).
 * Active snapshots cannot be deleted without first deactivating.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const { id } = req.params;
  if (!id) { res.status(400).json({ error: 'Missing id' }); return; }

  const [rows] = await db.execute(sql.raw(`
    SELECT id, status, is_active FROM anatomy_snapshots
    WHERE id = '${id.replace(/'/g, "''")}' AND status != 'deleted'
    LIMIT 1
  `)) as unknown as [Array<{ id: string; status: string; is_active: number }>, unknown];

  if (!rows?.length) {
    res.status(404).json({ error: 'Snapshot not found' });
    return;
  }
  if (rows[0].is_active) {
    res.status(400).json({ error: 'Cannot delete the active snapshot. Activate another snapshot first.' });
    return;
  }

  await db.execute(sql.raw(`
    UPDATE anatomy_snapshots
    SET status = 'deleted', is_active = 0, updated_at = NOW()
    WHERE id = '${id.replace(/'/g, "''")}'
  `));

  res.json({ ok: true, snapshotId: id, deleted: true });
}
