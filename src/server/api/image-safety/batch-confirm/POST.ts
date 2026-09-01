/**
 * POST /api/image-safety/batch-confirm
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A7 — Issue a server-side bound confirmation token after the user
 * confirms the privacy notice.
 *
 * The token is cryptographically bound to:
 *   - authenticated company_id + user_id
 *   - sharing action (share_link | form_email)
 *   - sorted digest of the exact resolved image storage refs (server-resolved)
 *   - sorted digest of recipients (form_email only, server-normalised)
 *   - expiry (5 minutes)
 *   - unique nonce
 *
 * SECURITY (spec §6):
 *  - The browser submits ONLY: action, jobId or submissionId, recipients
 *  - resolvedRefs are NEVER accepted from the browser — always resolved
 *    server-side from authenticated, company-scoped DB data
 *  - worstStatus is re-verified server-side — client-supplied value is ignored
 *    for all blocking logic
 *  - Blocked/elevated: 403 — token not issued
 *  - Token stores only SHA-256(rawToken) — raw token never persisted
 *  - Token is single-use and expires in 5 minutes
 *
 * BODY:
 *   {
 *     action: 'share_link' | 'form_email',
 *     jobId?: number | null,          // share_link only
 *     submissionId?: number | null,   // form_email only
 *     recipients?: string[],          // form_email only — normalised server-side
 *   }
 *
 * RESPONSE:
 *   { confirmationToken: string, expiresAt: string }
 */

import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import {
  resolveJobPhotoRefs,
  resolveFormPhotoRefs,
  getWorstSafeguardStatus,
  issueConfirmationToken,
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
      recipients?: unknown;
    };

    const action = body.action as SharingAction | undefined;
    if (action !== 'share_link' && action !== 'form_email') {
      return res.status(400).json({ error: 'action must be share_link or form_email' });
    }

    // ── Resolve image refs server-side (spec §6: never accept from browser) ──
    let serverRefs: string[] = [];
    if (action === 'share_link') {
      const jobId = typeof body.jobId === 'number' ? body.jobId : null;
      if (!jobId || !Number.isInteger(jobId) || jobId <= 0) {
        return res.status(400).json({ error: 'jobId is required for share_link' });
      }
      serverRefs = await resolveJobPhotoRefs(profile.companyId, jobId);
    } else {
      // form_email
      const submissionId = typeof body.submissionId === 'number' ? body.submissionId : null;
      if (!submissionId || !Number.isInteger(submissionId) || submissionId <= 0) {
        return res.status(400).json({ error: 'submissionId is required for form_email' });
      }
      serverRefs = await resolveFormPhotoRefs(profile.companyId, submissionId);
    }

    // ── Re-verify worst status server-side ────────────────────────────────────
    const serverWorstStatus = await getWorstSafeguardStatus(profile.companyId, serverRefs);

    // Never issue a token for blocked/elevated
    if (serverWorstStatus === 'blocked' || serverWorstStatus === 'elevated') {
      return res.status(403).json({
        error: 'External sharing is not permitted for these images',
        code: 'sharing_blocked',
      });
    }

    // ── Normalise recipients (form_email only) ────────────────────────────────
    let recipients: string[] | undefined;
    if (action === 'form_email') {
      if (!Array.isArray(body.recipients)) {
        return res.status(400).json({ error: 'recipients must be an array for form_email' });
      }
      recipients = (body.recipients as unknown[])
        .filter((r): r is string => typeof r === 'string' && r.length > 0 && r.length <= 254)
        .map(r => r.toLowerCase().trim())
        .filter((r, i, arr) => arr.indexOf(r) === i)  // dedupe
        .slice(0, 50);
      if (recipients.length === 0) {
        return res.status(400).json({ error: 'At least one recipient is required for form_email' });
      }
    }

    // ── Issue bound token (stores only SHA-256 hash; returns raw token) ───────
    const token = await issueConfirmationToken({
      companyId: profile.companyId,
      userId: session.user.id,
      action,
      storageRefs: serverRefs,
      recipients,
      worstStatus: serverWorstStatus,
    });

    if (!token) {
      return res.status(500).json({ error: 'Failed to issue confirmation token' });
    }

    return res.json({
      confirmationToken: token.tokenId,   // raw token — client presents this to consuming endpoint
      expiresAt: token.expiresAt,
    });
  } catch (err) {
    console.error('POST /api/image-safety/batch-confirm error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Confirmation failed' });
  }
}
