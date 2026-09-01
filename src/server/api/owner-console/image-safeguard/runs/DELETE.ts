/**
 * DELETE /api/owner-console/image-safeguard/runs
 * ─────────────────────────────────────────────────────────────────────────────
 * Force-terminates any active (pending/running) scan runs and deletes ALL
 * scan history (runs + findings + finding_keys).
 *
 * SECURITY: Platform-owner access only (requirePlatformOwner in entry.ts).
 *
 * RESPONSE:
 *   200 { terminated: number, deleted: number }
 */

import type { Request, Response } from 'express';
import { db } from '../../../../../lib/db.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  try {
    // 1. Count active runs before we nuke them (for the response summary)
    const activeRows = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM image_safeguard_scan_runs
      WHERE run_status IN ('pending', 'running')
    `);
    const terminated = Number((activeRows as Array<{ cnt: number }>)[0]?.cnt ?? 0);

    // 2. Delete finding_keys first (FK → findings)
    await db.execute(sql`
      DELETE fk FROM image_safeguard_finding_keys fk
      INNER JOIN image_safeguard_findings f ON fk.finding_id = f.id
    `);

    // 3. Delete findings (FK → scan_runs)
    await db.execute(sql`DELETE FROM image_safeguard_findings`);

    // 4. Delete all scan runs
    const deleteResult = await db.execute(sql`DELETE FROM image_safeguard_scan_runs`);
    const deleted = (deleteResult as { affectedRows?: number }).affectedRows ?? 0;

    res.json({ terminated, deleted });
  } catch (err) {
    console.error('[image-safeguard/runs DELETE] error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Failed to clear scan history.' });
  }
}
