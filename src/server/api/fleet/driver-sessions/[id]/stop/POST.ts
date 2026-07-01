/**
 * POST /api/fleet/driver-sessions/:id/stop
 * Stop a driving session. User can stop their own; admin/owner can stop any.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const session = (req as unknown as { user?: { id: string; companyId: number; role?: string } }).user;
  if (!session?.id) return res.status(401).json({ error: 'Unauthorised' });

  const sessionId = parseInt(req.params.id, 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: 'Invalid session id' });

  const isAdminOrOwner = session.role === 'admin' || session.role === 'owner';

  // Fetch the session
  const [rows] = await db.execute(
    sql`SELECT id, user_id, status, fleet_asset_id FROM fleet_driver_sessions
        WHERE id = ${sessionId} AND company_id = ${session.companyId}`
  ) as unknown as [Array<{ id: number; user_id: string; status: string; fleet_asset_id: number }>, unknown];

  if (!rows.length) return res.status(404).json({ error: 'Session not found' });
  const ds = rows[0];

  if (ds.user_id !== session.id && !isAdminOrOwner) {
    return res.status(403).json({ error: 'You can only stop your own driving session' });
  }

  if (ds.status !== 'active') {
    return res.status(400).json({ error: 'Session is already completed' });
  }

  await db.execute(
    sql`UPDATE fleet_driver_sessions SET status = 'completed', end_at = NOW(), updated_at = NOW()
        WHERE id = ${sessionId} AND company_id = ${session.companyId}`
  );

  res.json({ ok: true });
}
