/**
 * GET /api/owner-console/image-safeguard/runs/:runId/progress
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B — Lightweight live-progress poll for a scan run.
 *
 * Returns current counts + run_status for the given run.
 * Designed to be polled every 2 s while the UI shows the scanning spinner.
 *
 * SECURITY:
 *  - Platform-owner access only (requirePlatformOwner in entry.ts).
 *  - No R2 keys, signed URLs, image bytes, or credentials returned.
 *  - Sanitized errors only.
 */

import type { Request, Response } from 'express';
import { getRunProgress } from '../../../../../../lib/imageSafeguard/scanRunService.js';

export default async function handler(req: Request, res: Response) {
  const { runId } = req.params as { runId: string };

  if (!runId || !/^[0-9a-f-]{36}$/i.test(runId)) {
    return res.status(400).json({ error: 'invalid_run_id' });
  }

  const progress = await getRunProgress(runId);
  if (!progress) {
    return res.status(404).json({ error: 'run_not_found' });
  }

  return res.json(progress);
}
