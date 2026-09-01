/**
 * POST /api/image-safety/batch-status
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A7 — Query the worst-case safeguard status for a batch of images
 * before external sharing, resolving real image references server-side.
 *
 * BODY:
 *   {
 *     action: 'share_link' | 'form_email',
 *     jobId?: number | null,          // required for share_link
 *     submissionId?: number | null,   // required for form_email
 *   }
 *
 * RESPONSE:
 *   {
 *     worstStatus: SafeguardStatus,
 *     resolvedRefs: string[],   // actual refs resolved server-side
 *     refCount: number,
 *   }
 *
 * SECURITY:
 *  - Requires authenticated session
 *  - Requires company membership
 *  - Resolves refs server-side — client cannot supply refs
 *  - Only returns status for images belonging to the authenticated company
 *  - Never returns image bytes, signed URLs, or R2 keys
 *  - Fails closed: any resolution failure returns worstStatus='unavailable'
 */

import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import {
  getWorstSafeguardStatus,
  resolveJobPhotoRefs,
  resolveFormPhotoRefs,
} from '../../../lib/imageSafeguardService.js';
import type { SharingAction } from '../../../lib/imageSafeguardService.js';

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

    const body = req.body as {
      action?: unknown;
      jobId?: unknown;
      submissionId?: unknown;
    };

    const action = body.action as SharingAction | undefined;
    if (action !== 'share_link' && action !== 'form_email') {
      return res.status(400).json({ error: 'action must be share_link or form_email' });
    }

    // ── Resolve real image references server-side ─────────────────────────────
    let resolvedRefs: string[] = [];

    if (action === 'share_link') {
      const jobId = typeof body.jobId === 'number' ? body.jobId : null;
      if (!jobId || !Number.isInteger(jobId) || jobId <= 0) {
        return res.status(400).json({ error: 'jobId is required for share_link' });
      }
      resolvedRefs = await resolveJobPhotoRefs(profile.companyId, jobId);
    } else {
      // form_email
      const submissionId = typeof body.submissionId === 'number' ? body.submissionId : null;
      if (!submissionId || !Number.isInteger(submissionId) || submissionId <= 0) {
        return res.status(400).json({ error: 'submissionId is required for form_email' });
      }
      resolvedRefs = await resolveFormPhotoRefs(profile.companyId, submissionId);
    }

    const worstStatus = await getWorstSafeguardStatus(profile.companyId, resolvedRefs);

    return res.json({
      worstStatus,
      refCount: resolvedRefs.length,
    });
  } catch (err) {
    console.error('POST /api/image-safety/batch-status error:', err instanceof Error ? err.message : err);
    // Fail closed — return 'unavailable' so the confirmation is still shown
    return res.json({ worstStatus: 'unavailable', resolvedRefs: [], refCount: 0 });
  }
}
