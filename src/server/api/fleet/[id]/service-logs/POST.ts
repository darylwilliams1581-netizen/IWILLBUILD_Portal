/**
 * POST /api/fleet/:id/service-logs
 * Creates a new service/maintenance log entry for a fleet asset.
 * Also updates current_odometer_km on the asset if odometer_km is provided.
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
      sql`SELECT id FROM fleet_assets WHERE id = ${assetId} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number }>];
    if (!assetCheck?.length) return res.status(404).json({ error: 'Asset not found' });

    const {
      service_type = 'Service',
      title,
      service_date,
      odometer_km,
      cost,
      provider,
      invoice_number,
      notes,
      next_service_date,
      next_service_km,
      status = 'completed',
    } = req.body as Record<string, unknown>;

    if (!title || !service_date) {
      return res.status(400).json({ error: 'title and service_date are required' });
    }

    const [result] = await db.execute(sql`
      INSERT INTO fleet_service_logs
        (company_id, fleet_asset_id, service_type, title, service_date, odometer_km, cost, provider, invoice_number, notes, next_service_date, next_service_km, status, created_by_user_id)
      VALUES
        (${profile.companyId}, ${assetId}, ${service_type}, ${title}, ${service_date},
         ${odometer_km ?? null}, ${cost ?? null}, ${provider ?? null}, ${invoice_number ?? null},
         ${notes ?? null}, ${next_service_date ?? null}, ${next_service_km ?? null},
         ${status}, ${session.user.id})
    `) as unknown as [{ insertId: number }];

    // Update asset odometer if provided
    if (odometer_km) {
      await db.execute(sql`
        UPDATE fleet_assets
        SET current_odometer_km = ${odometer_km}, updated_at = NOW()
        WHERE id = ${assetId}
          AND company_id = ${profile.companyId}
          AND (current_odometer_km IS NULL OR current_odometer_km < ${odometer_km})
      `);
    }

    const insertId = (result as unknown as { insertId: number }).insertId;
    const [newRow] = await db.execute(
      sql`SELECT * FROM fleet_service_logs WHERE id = ${insertId} LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>];

    res.status(201).json({ log: newRow?.[0] ?? { id: insertId } });
  } catch (err) {
    console.error('POST /api/fleet/:id/service-logs error:', err);
    res.status(500).json({ error: 'Failed to create service log' });
  }
}
