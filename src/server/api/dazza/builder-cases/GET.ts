/**
 * GET /api/dazza/builder-cases
 * ─────────────────────────────────────────────────────────────────────────────
 * List builder cases for the authenticated platform owner.
 * Query params: status (optional), limit (optional, max 100)
 */

import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../lib/platform-owner-guard.js';
import { listBuilderCases, type BuilderCaseStatus } from '../../../lib/builder-case-service.js';

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const status = req.query.status as BuilderCaseStatus | undefined;
    const limit = parseInt(String(req.query.limit ?? '50'), 10);

    const cases = await listBuilderCases(ownerInfo.userId, { status, limit });
    return res.json({ ok: true, cases });
  } catch (err) {
    console.error('[builder-cases/GET]', err);
    return res.status(500).json({ error: 'Failed to list builder cases.' });
  }
}
