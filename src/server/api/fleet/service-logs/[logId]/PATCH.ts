/**
 * PATCH /api/fleet/service-logs/:logId
 * Updates a service log entry.
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

    const logId = parseInt(String(req.params.logId), 10);
    if (isNaN(logId)) return res.status(400).json({ error: 'Invalid log ID' });

    // Verify log belongs to company
    const [check] = await db.execute(
      sql`SELECT id FROM fleet_service_logs WHERE id = ${logId} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number }>];
    if (!check?.length) return res.status(404).json({ error: 'Log not found' });

    const allowed = ['service_type','title','service_date','odometer_km','cost','provider','invoice_number','notes','next_service_date','next_service_km','status'];
    const body = req.body as Record<string, unknown>;
    const sets: string[] = [];

    for (const key of allowed) {
      if (key in body) {
        const val = body[key];
        sets.push(`${key} = ${val === null || val === '' ? 'NULL' : `'${String(val).replace(/'/g, "''")}'`}`);
      }
    }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = NOW()');

    await db.execute(sql.raw(`UPDATE fleet_service_logs SET ${sets.join(', ')} WHERE id = ${logId} AND company_id = ${profile.companyId}`));

    const [updated] = await db.execute(
      sql`SELECT * FROM fleet_service_logs WHERE id = ${logId} LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>];

    res.json({ log: updated?.[0] });
  } catch (err) {
    console.error('PATCH /api/fleet/service-logs/:logId error:', err);
    res.status(500).json({ error: 'Failed to update service log' });
  }
}
