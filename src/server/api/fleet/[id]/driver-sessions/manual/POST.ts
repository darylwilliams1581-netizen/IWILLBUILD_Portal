/**
 * POST /api/fleet/:id/driver-sessions/manual
 * Admin endpoint to manually log a drive session for a fleet asset.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  try {
    const result = await getSessionAndProfile(req, res);
    if (!result) return; // response already sent by getSessionAndProfile
    const { session } = result;

    const fleetAssetId = Number(req.params.id);
    if (!fleetAssetId || isNaN(fleetAssetId)) {
      return res.status(400).json({ error: 'Invalid fleet asset ID' });
    }

    const { driverName, startAt, endAt, notes } = req.body as {
      driverName?: string;
      startAt?: string;
      endAt?: string | null;
      notes?: string | null;
    };

    if (!driverName?.trim()) {
      return res.status(400).json({ error: 'Driver name is required' });
    }
    if (!startAt) {
      return res.status(400).json({ error: 'Start time is required' });
    }

    const startDate = new Date(startAt);
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ error: 'Invalid start time' });
    }

    let endDate: Date | null = null;
    if (endAt) {
      endDate = new Date(endAt);
      if (isNaN(endDate.getTime())) {
        return res.status(400).json({ error: 'Invalid end time' });
      }
      if (endDate <= startDate) {
        return res.status(400).json({ error: 'End time must be after start time' });
      }
    }

    // Verify the fleet asset exists
    const assetRows = await db.execute(
      sql`SELECT id FROM fleet_assets WHERE id = ${fleetAssetId} LIMIT 1`
    );
    if (!assetRows.rows.length) {
      return res.status(404).json({ error: 'Fleet asset not found' });
    }

    const status = endDate ? 'completed' : 'active';

    // Insert the manual session — use notes column if it exists, otherwise skip it
    let insertResult;
    try {
      insertResult = await db.execute(sql`
        INSERT INTO fleet_driver_sessions
          (fleet_asset_id, driver_name, start_at, end_at, status, source, notes, created_at)
        VALUES (
          ${fleetAssetId},
          ${driverName.trim()},
          ${startDate.toISOString()},
          ${endDate ? endDate.toISOString() : null},
          ${status},
          'manual',
          ${notes?.trim() || null},
          NOW()
        )
        RETURNING id
      `);
    } catch {
      // notes column may not exist — retry without it
      insertResult = await db.execute(sql`
        INSERT INTO fleet_driver_sessions
          (fleet_asset_id, driver_name, start_at, end_at, status, source, created_at)
        VALUES (
          ${fleetAssetId},
          ${driverName.trim()},
          ${startDate.toISOString()},
          ${endDate ? endDate.toISOString() : null},
          ${status},
          'manual',
          NOW()
        )
        RETURNING id
      `);
    }

    return res.status(201).json({ ok: true, sessionId: insertResult.rows[0]?.id });
  } catch (err) {
    console.error('Manual trip log error:', err);
    return res.status(500).json({ error: 'Failed to log trip' });
  }
}
