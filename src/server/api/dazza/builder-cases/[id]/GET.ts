/**
 * GET /api/dazza/builder-cases/:id
 * ─────────────────────────────────────────────────────────────────────────────
 * Get a single builder case. Platform owner only.
 * Cross-owner IDs return 403 (not 404) to avoid enumeration.
 */

import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';
import { getBuilderCase } from '../../../../lib/builder-case-service.js';

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const { id } = req.params;
    if (!id?.trim()) return res.status(400).json({ error: 'id is required' });

    const caseRow = await getBuilderCase(id, ownerInfo.userId);
    if (!caseRow) return res.status(403).json({ error: 'Not found or access denied.' });

    return res.json({ ok: true, case: caseRow });
  } catch (err) {
    console.error('[builder-cases/:id/GET]', err);
    return res.status(500).json({ error: 'Failed to get builder case.' });
  }
}
