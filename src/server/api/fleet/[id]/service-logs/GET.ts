/**
 * GET /api/fleet/:id/service-logs
 * Returns all service/maintenance log entries for a fleet asset.
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

    const assetId = parseInt(String(req.params.id), 10);
    if (isNaN(assetId)) return res.status(400).json({ error: 'Invalid asset ID' });

    // Verify asset belongs to company
    const [assetCheck] = await db.execute(
      sql`SELECT id, current_odometer_km FROM fleet_assets WHERE id = ${assetId} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number; current_odometer_km?: number }>];
    if (!assetCheck?.length) return res.status(404).json({ error: 'Asset not found' });

    const [rows] = await db.execute(sql`
      SELECT
        sl.*,
        u.name AS created_by_name
      FROM fleet_service_logs sl
      LEFT JOIN user u ON u.id = sl.created_by_user_id
      WHERE sl.fleet_asset_id = ${assetId}
        AND sl.company_id = ${profile.companyId}
      ORDER BY sl.service_date DESC, sl.id DESC
    `) as unknown as [Array<Record<string, unknown>>];

    // Next service alert: find the earliest upcoming next_service_date
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = (rows ?? []).filter(r => r.next_service_date && String(r.next_service_date) >= today);
    const nextAlert = upcoming.length > 0 ? upcoming[upcoming.length - 1] : null;

    res.json({
      logs: rows ?? [],
      currentOdometerKm: assetCheck[0].current_odometer_km ?? null,
      nextServiceAlert: nextAlert ? {
        date: nextAlert.next_service_date,
        km: nextAlert.next_service_km,
        title: nextAlert.title,
      } : null,
    });
  } catch (err) {
    console.error('GET /api/fleet/:id/service-logs error:', err);
    res.status(500).json({ error: 'Failed to load service logs' });
  }
}
