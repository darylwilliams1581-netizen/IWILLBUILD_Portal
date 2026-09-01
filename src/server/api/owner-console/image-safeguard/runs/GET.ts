/**
 * GET /api/owner-console/image-safeguard/runs
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B2 — Returns recent scan runs (most recent first).
 *
 * QUERY PARAMS:
 *   limit: number (default 10, max 50)
 *
 * SECURITY:
 *  - Platform-owner access only (requirePlatformOwner middleware in entry.ts).
 *  - No R2 keys, signed URLs, image bytes, or credentials returned.
 *  - Sanitized errors only.
 */

import type { Request, Response } from 'express';
import { getRecentRuns } from '../../../../lib/imageSafeguard/scanRunService.js';

export default async function handler(req: Request, res: Response) {
  try {
    const rawLimit = Number(req.query.limit ?? 10);
    const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 10 : rawLimit), 50);
    const runs = await getRecentRuns(limit);
    return res.json({ runs });
  } catch {
    return res.status(500).json({ error: 'Failed to retrieve scan runs.' });
  }
}
