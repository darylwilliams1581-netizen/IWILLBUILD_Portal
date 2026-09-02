/**
 * GET /api/owner-console/image-safeguard/runs
 * ─────────────────────────────────────────────────────────────────────────────
 * The in-app scanner has been removed. Returns an empty run list.
 */

import type { Request, Response } from 'express';

export default function handler(_req: Request, res: Response) {
  return res.json({ runs: [] });
}
