/**
 * GET /api/owner-console/image-safeguard/status
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B1 — Returns the current Image Safeguard scanner capability and
 * platform-wide record counts, grouped by status.
 *
 * SECURITY:
 *  - Platform-owner access only (requirePlatformOwner middleware in entry.ts).
 *  - Does NOT return storage keys, signed URLs, filenames, image contents
 *    or provider credentials.
 *  - Fails closed: any DB error returns sanitized counts of zero.
 *  - Raw database errors are never included in the response.
 *
 * RESPONSE SHAPE:
 *  {
 *    configured: boolean,
 *    provider: string | null,
 *    capability: 'unavailable',
 *    lastRunAt: null,
 *    counts: {
 *      pending: number,
 *      clear: number,
 *      privacySignal: number,
 *      elevated: number,
 *      blocked: number,
 *      unavailable: number,
 *      failed: number,
 *    }
 *  }
 */

import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getImageSafeguardCapability } from '../../../../lib/imageSafeguardCapability.js';

// Zero-value counts — returned on any DB failure (fail closed).
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

    // Query platform-wide counts from image_safeguard_records.
    // Groups by status; returns only the count — no keys, URLs or image data.
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
          case 'pending':       counts.pending       += n; break;
          case 'clear':         counts.clear         += n; break;
          case 'privacy_signal':counts.privacySignal += n; break;
          case 'elevated':      counts.elevated      += n; break;
          case 'blocked':       counts.blocked       += n; break;
          case 'unavailable':   counts.unavailable   += n; break;
          case 'error':
          case 'failed':        counts.failed        += n; break;
          // Unknown statuses are silently ignored — no internal detail exposed.
        }
      }
    } catch {
      // DB failure — return zero counts; do not expose the error.
      counts = { ...ZERO_COUNTS };
    }

    return res.json({
      configured: capability.configured,
      provider: capability.provider,
      // capability field: 'unavailable' until a real provider is configured.
      capability: capability.configured ? 'available' : 'unavailable',
      lastRunAt: null,
      counts,
    });
  } catch {
    // Outer catch — sanitized 500, no internal detail.
    return res.status(500).json({ error: 'Failed to retrieve safeguard status.' });
  }
}
