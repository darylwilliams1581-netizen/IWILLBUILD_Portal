/**
 * GET /api/dazza/builder-cases/by-bug/:bugId
 * ─────────────────────────────────────────────────────────────────────────────
 * Get the most recent builder case linked to a bug report.
 * Returns 404 if none exists (not 403 — absence is not sensitive).
 */

import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../../lib/platform-owner-guard.js';
import { getBuilderCaseByBugId } from '../../../../../lib/builder-case-service.js';

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const { bugId } = req.params;
    if (!bugId?.trim()) return res.status(400).json({ error: 'bugId is required' });

    const caseRow = await getBuilderCaseByBugId(bugId, ownerInfo.userId);
    if (!caseRow) return res.status(404).json({ ok: false, case: null });

    return res.json({ ok: true, case: caseRow });
  } catch (err) {
    console.error('[builder-cases/by-bug/:bugId/GET]', err);
    return res.status(500).json({ error: 'Failed to get builder case.' });
  }
}
