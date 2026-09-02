/**
 * POST /api/owner-console/image-safeguard/scan
 * ─────────────────────────────────────────────────────────────────────────────
 * The in-app scanner has been removed. This endpoint is no longer active.
 * Scanning is handled by a separate Cloudflare service.
 */

import type { Request, Response } from 'express';

export default function handler(_req: Request, res: Response) {
  return res.status(410).json({
    error: 'scanner_removed',
    message:
      'The in-app image scanner has been removed. ' +
      'Backend scans run in a separate Cloudflare service on the same R2 store.',
  });
}
