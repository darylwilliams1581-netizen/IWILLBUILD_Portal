/**
 * GET /api/owner-console/image-safeguard/status
 * ─────────────────────────────────────────────────────────────────────────────
 * The in-app scanner has been removed. Returns static capability (not
 * configured) and platform-wide image_safeguard_records counts only.
 * No scan run data, no classifier provider, no R2 access.
 *
 * SECURITY: Platform-owner access only (requirePlatformOwner in entry.ts).
 */

import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';

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

  return res.json({
    configured:  false,
    provider:    null,
    capability:  'unavailable',
    counts,
    scannerNote:
      'Image scanning is not active inside the IWIllBUILD application. ' +
      'A separate Cloudflare service handles backend scans on the same R2 store.',
  });
}
