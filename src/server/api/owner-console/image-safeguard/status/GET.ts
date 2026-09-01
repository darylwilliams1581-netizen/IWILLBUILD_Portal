/**
 * GET /api/owner-console/image-safeguard/status
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B2 — Returns scanner capability, platform-wide record counts,
 * last successful scan cursor, and the most recent run summary.
 *
 * SECURITY:
 *  - Platform-owner access only (requirePlatformOwner middleware in entry.ts).
 *  - No storage keys, signed URLs, image bytes, or credentials returned.
 *  - Fails closed: DB errors return zero counts, not error details.
 *  - Raw DB errors never included in response.
 *
 * RESPONSE SHAPE:
 *  {
 *    configured: boolean,
 *    provider: string | null,
 *    capability: 'available' | 'unavailable',
 *    lastSuccessfulScanAt: string | null,
 *    lastRun: ScanRunRecord | null,
 *    counts: { pending, clear, privacySignal, elevated, blocked, unavailable, failed }
 *  }
 */

import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getImageSafeguardCapability } from '../../../../lib/imageSafeguardCapability.js';
import { getLastSuccessfulScanAt, getRecentRuns } from '../../../../lib/imageSafeguard/scanRunService.js';

const ZERO_COUNTS = {
  pending: 0,
  clear: 0,
  privacySignal: 0,
  elevated: 0,
  blocked: 0,
  unavailable: 0,
  failed: 0,
};

export default async function handler(_req: Request, res: Response) {
  // requirePlatformOwner middleware applied in entry.ts — access already verified.
  try {
    const capability = getImageSafeguardCapability();

    // Record counts from image_safeguard_records
    let counts = { ...ZERO_COUNTS };
    try {
      const rows = await db.execute(sql`
        SELECT status, COUNT(*) AS cnt
        FROM image_safeguard_records
        GROUP BY status
      `);
      const rawRows = rows as unknown as Array<{ status: string; cnt: number | string }>;
      for (const row of rawRows) {
        const n = Number(row.cnt);
        switch (row.status) {
          case 'pending':        counts.pending       += n; break;
          case 'clear':          counts.clear         += n; break;
          case 'privacy_signal': counts.privacySignal += n; break;
          case 'elevated':       counts.elevated      += n; break;
          case 'blocked':        counts.blocked       += n; break;
          case 'unavailable':    counts.unavailable   += n; break;
          case 'error':
          case 'failed':         counts.failed        += n; break;
        }
      }
    } catch {
      counts = { ...ZERO_COUNTS };
    }

    // Last successful scan cursor
    const lastSuccessfulScanAt = await getLastSuccessfulScanAt();

    // Most recent run
    const recentRuns = await getRecentRuns(1);
    const lastRun = recentRuns[0] ?? null;

    return res.json({
      configured:           capability.configured,
      provider:             capability.provider,
      capability:           capability.configured ? 'available' : 'unavailable',
      lastSuccessfulScanAt: lastSuccessfulScanAt?.toISOString() ?? null,
      lastRun,
      counts,
    });
  } catch {
    return res.status(500).json({ error: 'Failed to retrieve safeguard status.' });
  }
}
