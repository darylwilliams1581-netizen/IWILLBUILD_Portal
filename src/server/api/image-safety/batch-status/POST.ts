/**
 * POST /api/image-safety/batch-status
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A §6 — Query the worst-case safeguard status for a batch of images
 * before external sharing.
 *
 * Called by useImageSafeguardBatch before showing the confirmation modal.
 * Returns the worst-case status across all images in the batch.
 *
 * SECURITY:
 *  - Requires authenticated session
 *  - Requires company membership
 *  - Only returns status for images belonging to the authenticated company
 *  - Never returns image bytes, signed URLs, or R2 keys
 *
 * BODY:
 *   { storageRefs: string[], jobId?: number | null }
 *
 * RESPONSE:
 *   { worstStatus: SafeguardStatus }
 */

import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { getWorstSafeguardStatus } from '../../../lib/imageSafeguardService.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const { storageRefs } = req.body as { storageRefs?: unknown };
    if (!Array.isArray(storageRefs)) {
      return res.status(400).json({ error: 'storageRefs must be an array' });
    }

    // Validate and sanitise storage refs — must be strings, max 255 chars each
    const validRefs = storageRefs
      .filter((r): r is string => typeof r === 'string' && r.length > 0 && r.length <= 255)
      .slice(0, 200); // max 200 refs per batch

    const worstStatus = await getWorstSafeguardStatus(profile.companyId, validRefs);

    return res.json({ worstStatus });
  } catch (err) {
    console.error('POST /api/image-safety/batch-status error:', err instanceof Error ? err.message : err);
    // Fail closed — return 'unavailable' so the confirmation is still shown
    return res.json({ worstStatus: 'unavailable' });
  }
}
