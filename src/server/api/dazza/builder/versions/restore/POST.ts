/**
 * POST /api/dazza/builder/versions/restore
 * ─────────────────────────────────────────────────────────────────────────────
 * Restore a template to a previous version snapshot.
 * Creates a new version entry (does not erase history).
 *
 * Body: { versionId: string }
 */
import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../../lib/platform-owner-guard.js';
import { restoreBuilderVersion } from '../../../../../lib/dazza-builder-brain.js';

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const { versionId } = req.body as { versionId?: string };
    if (!versionId?.trim()) return res.status(400).json({ error: 'versionId required' });

    const result = await restoreBuilderVersion(versionId, ownerInfo.userId);

    if (!result.ok) {
      return res.status(422).json({ error: result.error });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
