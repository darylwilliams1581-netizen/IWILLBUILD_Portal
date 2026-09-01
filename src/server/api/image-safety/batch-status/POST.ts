/**
 * POST /api/image-safety/batch-status
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A — Query the worst-case safeguard status for a batch of images
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
 *     refCount: number,               // 0 = no images → no modal needed
 *   }
 *
 * SECURITY:
 *  - Requires authenticated session
 *  - Requires company membership
 *  - Resolves refs server-side — client cannot supply refs
 *  - Only returns status for images belonging to the authenticated company
 *  - Never returns image bytes, signed URLs, or R2 keys
 *  - Fails closed: any resolution failure returns worstStatus='unavailable'
 *    with refCount=1 so the confirmation is still shown
 */

import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import {
  getWorstSafeguardStatus,
  resolveJobPhotoRefs,
} from '../../../lib/imageSafeguardService.js';

// ── Form-submission image detection ──────────────────────────────────────────
// Mirrors the logic in send-email/POST.ts — counts photo-type answers.
// Returns the number of photo fields that have at least one value.
// Fails closed (returns 1) on any parse error so the modal is still shown.

async function countFormSubmissionImages(
  companyId: number,
  submissionId: number,
): Promise<number> {
  try {
    const rows = await db.execute(sql`
      SELECT jfs.answers_json, jft.fields_json
      FROM job_form_submissions jfs
      JOIN job_form_templates jft ON jft.id = jfs.template_id
      WHERE jfs.id = ${submissionId} AND jfs.company_id = ${companyId}
      LIMIT 1
    `);
    const row = (rows as unknown as Array<{
      answers_json: string | null;
      fields_json: string | null;
    }>)[0];
    if (!row) return 0;

    let answers: Record<string, unknown> = {};
    let fields: Array<{ id: string | number; fieldType?: string }> = [];
    try {
      if (row.answers_json) answers = JSON.parse(row.answers_json) as Record<string, unknown>;
      if (row.fields_json) fields = JSON.parse(row.fields_json) as typeof fields;
    } catch {
      return 1; // fail closed
    }

    const photoFieldIds = fields
      .filter(f => f.fieldType === 'photo')
      .map(f => String(f.id));

    return photoFieldIds.filter(id => {
      const val = answers[id];
      if (!val) return false;
      if (Array.isArray(val)) return val.length > 0;
      if (typeof val === 'string') return val.length > 0;
      return false;
    }).length;
  } catch {
    return 1; // fail closed — show the modal
  }
}

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

    const action = body.action as string | undefined;
    if (action !== 'share_link' && action !== 'form_email') {
      return res.status(400).json({ error: 'action must be share_link or form_email' });
    }

    // ── Resolve real image references server-side ─────────────────────────────
    let resolvedRefs: string[] = [];
    let refCount = 0;

    if (action === 'share_link') {
      const jobId = typeof body.jobId === 'number' ? body.jobId : null;
      if (!jobId || !Number.isInteger(jobId) || jobId <= 0) {
        return res.status(400).json({ error: 'jobId is required for share_link' });
      }
      resolvedRefs = await resolveJobPhotoRefs(profile.companyId, jobId);
      refCount = resolvedRefs.length;
    } else {
      // form_email: count photo-type answers to determine whether a modal is needed
      const submissionId = typeof body.submissionId === 'number' ? body.submissionId : null;
      if (!submissionId || !Number.isInteger(submissionId) || submissionId <= 0) {
        return res.status(400).json({ error: 'submissionId is required for form_email' });
      }
      refCount = await countFormSubmissionImages(profile.companyId, submissionId);
      // Use an opaque ref for status lookup when images are present
      if (refCount > 0) {
        resolvedRefs = [`form_submission:${submissionId}`];
      }
    }

    // No images → no modal needed; return early with refCount=0
    if (refCount === 0) {
      return res.json({ worstStatus: 'clear', refCount: 0 });
    }

    const worstStatus = await getWorstSafeguardStatus(profile.companyId, resolvedRefs);

    return res.json({ worstStatus, refCount });
  } catch (err) {
    console.error('POST /api/image-safety/batch-status error:', err instanceof Error ? err.message : err);
    // Fail closed — return 'unavailable' with refCount=1 so the confirmation is still shown
    return res.json({ worstStatus: 'unavailable', refCount: 1 });
  }
}
