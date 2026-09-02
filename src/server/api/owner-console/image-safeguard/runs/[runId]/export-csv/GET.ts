/**
 * GET /api/owner-console/image-safeguard/runs/:runId/export-csv
 * ─────────────────────────────────────────────────────────────────────────────
 * The in-app scanner has been removed. This endpoint is no longer active.
 */

import type { Request, Response } from 'express';

export default function handler(_req: Request, res: Response) {
  return res.status(410).json({
    error: 'scanner_removed',
    message: 'The in-app scanner has been removed.',
  });
}
