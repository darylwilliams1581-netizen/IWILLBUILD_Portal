/**
 * DELETE /api/fleet/service-logs/:logId
 * Deletes a service log entry (admin/owner only).
 */
import type { Request, Response } from 'express';
import { getAuth } from '@/lib/auth/auth';
import { db } from '@/server/db/client';
import { profiles } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

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

    const isAdmin = profile.role === 'owner' || profile.role === 'admin' || profile.permAdmin === true;
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const logId = parseInt(String(req.params.logId), 10);
    if (isNaN(logId)) return res.status(400).json({ error: 'Invalid log ID' });

    const [check] = await db.execute(
      sql`SELECT id FROM fleet_service_logs WHERE id = ${logId} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number }>];
    if (!check?.length) return res.status(404).json({ error: 'Log not found' });

    await db.execute(sql`DELETE FROM fleet_service_logs WHERE id = ${logId} AND company_id = ${profile.companyId}`);

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/fleet/service-logs/:logId error:', err);
    res.status(500).json({ error: 'Failed to delete service log' });
  }
}
