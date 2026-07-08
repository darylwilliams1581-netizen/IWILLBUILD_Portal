/**
 * POST /api/fleet/:id/signin
 * Start a usage session for a fleet asset.
 *
 * Body: { jobId?, actorType?, note?, meterStart?, source? }
 *
 * Rules:
 *  - One active session per fleet asset at a time.
 *  - Returns 409 with active session info on duplicate.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  try {
    const ctx = await getSessionAndProfile(req, res);
    if (!ctx) return;

    const fleetId   = parseInt(req.params.id);
    const companyId = ctx.profile.companyId;
    const userId    = ctx.session.user.id;

    if (!fleetId) return res.status(400).json({ error: 'Invalid fleet id' });

    const {
      jobId      = null,
      actorType  = 'employee',
      note       = null,
      meterStart = null,
      source     = 'portal',
    } = req.body as {
      jobId?: number | null;
      actorType?: string;
      note?: string | null;
      meterStart?: number | null;
      source?: string;
    };

    const validActorTypes = ['employee', 'contractor', 'consultant', 'delivery_driver', 'guest'];
    if (!validActorTypes.includes(actorType)) {
      return res.status(400).json({ error: 'Invalid actor_type' });
    }

    // Verify asset belongs to company
    const [assetRows] = await db.execute(
      sql`SELECT id, name, status FROM fleet_assets
          WHERE id = ${fleetId} AND company_id = ${companyId} AND archived = 0 LIMIT 1`
    ) as unknown as [Array<{ id: number; name: string; status: string }>, unknown];

    if (!assetRows.length) return res.status(404).json({ error: 'Asset not found' });
    if (assetRows[0].status === 'Out of Service') {
      return res.status(400).json({ error: 'This asset is out of service and cannot be signed on.' });
    }

    // Check for existing active session on this asset
    const [activeRows] = await db.execute(
      sql`SELECT id, user_id, started_at,
                 TIMESTAMPDIFF(MINUTE, started_at, NOW()) AS elapsed_minutes
          FROM fleet_usage_logs
          WHERE fleet_id = ${fleetId}
            AND company_id = ${companyId}
            AND ended_at IS NULL
          LIMIT 1`
    ) as unknown as [Array<{ id: number; user_id: string; started_at: string; elapsed_minutes: number }>, unknown];

    if (activeRows.length) {
      return res.status(409).json({
        error: 'This asset already has an active usage session. Sign off first.',
        activeSession: activeRows[0],
      });
    }

    // Create session
    await db.execute(
      sql`INSERT INTO fleet_usage_logs
            (company_id, fleet_id, job_id, user_id, actor_type,
             started_at, source, note, meter_start, created_by)
          VALUES
            (${companyId}, ${fleetId}, ${jobId}, ${userId}, ${actorType},
             NOW(), ${source}, ${note}, ${meterStart}, ${userId})`
    );

    // Return the new session
    const [newRows] = await db.execute(
      sql`SELECT id, fleet_id, job_id, user_id, actor_type, started_at, source, note, meter_start
          FROM fleet_usage_logs
          WHERE fleet_id = ${fleetId} AND company_id = ${companyId} AND ended_at IS NULL
          ORDER BY id DESC LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ ok: true, session: newRows[0] ?? null });
  } catch (error) {
    console.error('POST /api/fleet/:id/signin error:', error);
    res.status(500).json({ error: 'Failed to start usage session' });
  }
}
