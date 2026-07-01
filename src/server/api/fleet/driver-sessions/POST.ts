/**
 * POST /api/fleet/driver-sessions
 * Start a new driving session for the current user.
 * Rules:
 *  - User can only have one active session at a time.
 *  - Asset can only have one active session at a time.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const betterSession = await auth.api.getSession({ headers });
    if (!betterSession?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, betterSession.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const userId = betterSession.user.id;
    const userName = betterSession.user.name ?? 'Unknown';
    const companyId = profile.companyId;

    const { fleetAssetId } = req.body as { fleetAssetId?: number };
    if (!fleetAssetId) return res.status(400).json({ error: 'fleetAssetId is required' });

    // Verify asset belongs to company and is active
    const [assetRows] = await db.execute(
      sql`SELECT id, name, type, status FROM fleet_assets
          WHERE id = ${fleetAssetId} AND company_id = ${companyId} AND archived = 0`
    ) as unknown as [Array<{ id: number; name: string; type: string; status: string }>, unknown];

    if (!assetRows.length) return res.status(404).json({ error: 'Asset not found' });
    const asset = assetRows[0];
    if (asset.status === 'Out of Service') {
      return res.status(400).json({ error: 'This asset is out of service and cannot be driven.' });
    }

    // Check user already has an active session
    const [userActive] = await db.execute(
      sql`SELECT id, fleet_asset_id FROM fleet_driver_sessions
          WHERE company_id = ${companyId} AND user_id = ${userId} AND status = 'active'
          LIMIT 1`
    ) as unknown as [Array<{ id: number; fleet_asset_id: number }>, unknown];

    if (userActive.length) {
      return res.status(409).json({
        error: 'You already have an active driving session. Stop it before starting a new one.',
        existingSessionId: userActive[0].id,
      });
    }

    // Check asset already has an active session
    const [assetActive] = await db.execute(
      sql`SELECT fds.id, fds.driver_name FROM fleet_driver_sessions fds
          WHERE fds.company_id = ${companyId} AND fds.fleet_asset_id = ${fleetAssetId} AND fds.status = 'active'
          LIMIT 1`
    ) as unknown as [Array<{ id: number; driver_name: string }>, unknown];

    if (assetActive.length) {
      return res.status(409).json({ error: `This asset is currently checked out by ${assetActive[0].driver_name}.` });
    }

    // Create session
    await db.execute(
      sql`INSERT INTO fleet_driver_sessions (company_id, fleet_asset_id, user_id, driver_name, start_at, status, source)
          VALUES (${companyId}, ${fleetAssetId}, ${userId}, ${userName}, NOW(), 'active', 'dashboard_quick_start')`
    );

    const [newRows] = await db.execute(
      sql`SELECT fds.id, fds.fleet_asset_id, fds.driver_name, fds.start_at, fds.status, fds.source,
                 fa.name as asset_name, fa.type as asset_type, fa.rego
          FROM fleet_driver_sessions fds
          JOIN fleet_assets fa ON fa.id = fds.fleet_asset_id
          WHERE fds.company_id = ${companyId} AND fds.user_id = ${userId} AND fds.status = 'active'
          ORDER BY fds.id DESC LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ ok: true, session: newRows[0] ?? null });
  } catch (error) {
    console.error('POST /api/fleet/driver-sessions error:', error);
    res.status(500).json({ error: 'Failed to start driving session' });
  }
}
