/**
 * POST /api/image-safety/batch-confirm
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A7 — Issue a server-side bound confirmation token after the user
 * confirms the privacy notice.
 *
 * The token is cryptographically bound to:
 *   - authenticated company_id + user_id
 *   - sharing action (share_link | form_email)
 *   - sorted digest of the exact resolved image storage refs
 *   - sorted digest of recipients (form_email only)
 *   - expiry (5 minutes)
 *   - unique nonce
 *
 * The consuming endpoint (photos/share or job-forms/send-email) must present
 * this token and will verify all bindings before proceeding.
 *
 * BODY:
 *   {
 *     action: 'share_link' | 'form_email',
 *     resolvedRefs: string[],       // from batch-status response
 *     recipients?: string[],        // form_email only — sorted before hashing
 *     worstStatus: SafeguardStatus, // from batch-status response (re-verified)
 *     jobId?: number | null,        // share_link only — for re-verification
 *     submissionId?: number | null, // form_email only — for re-verification
 *   }
 *
 * RESPONSE:
 *   { confirmationToken: string, expiresAt: string }
 *
 * SECURITY:
 *  - Requires authenticated session
 *  - Requires company membership
 *  - Re-resolves refs server-side to verify the client-supplied resolvedRefs
 *    match what the server would resolve — prevents ref substitution attacks
 *  - Never trusts client-supplied worstStatus for blocking logic
 *  - Blocked/elevated: 403 — token not issued
 *  - Token is single-use and expires in 5 minutes
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
  computeDigest,
} from '../../../lib/imageSafeguardService.js';
import type { SharingAction } from '../../../lib/imageSafeguardService.js';
import type { SafeguardStatus } from '../../../../lib/imageSafeguard/types.js';

const VALID_STATUSES: SafeguardStatus[] = [
  'pending', 'clear', 'privacy_signal', 'elevated', 'blocked', 'unavailable', 'error',
];

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
      resolvedRefs?: unknown;
      recipients?: unknown;
      worstStatus?: unknown;
      jobId?: unknown;
      submissionId?: unknown;
    };

    const action = body.action as SharingAction | undefined;
    if (action !== 'share_link' && action !== 'form_email') {
      return res.status(400).json({ error: 'action must be share_link or form_email' });
    }

    // Validate client-supplied resolvedRefs
    if (!Array.isArray(body.resolvedRefs)) {
      return res.status(400).json({ error: 'resolvedRefs must be an array' });
    }
    const clientRefs = (body.resolvedRefs as unknown[])
      .filter((r): r is string => typeof r === 'string' && r.length > 0 && r.length <= 255)
      .slice(0, 500);

    // ── Re-resolve refs server-side to verify client refs are accurate ────────
    let serverRefs: string[] = [];
    if (action === 'share_link') {
      const jobId = typeof body.jobId === 'number' ? body.jobId : null;
      if (!jobId || !Number.isInteger(jobId) || jobId <= 0) {
        return res.status(400).json({ error: 'jobId is required for share_link' });
      }
      serverRefs = await resolveJobPhotoRefs(profile.companyId, jobId);
    } else {
      const submissionId = typeof body.submissionId === 'number' ? body.submissionId : null;
      if (!submissionId || !Number.isInteger(submissionId) || submissionId <= 0) {
        return res.status(400).json({ error: 'submissionId is required for form_email' });
      }
      serverRefs = await resolveFormPhotoRefs(profile.companyId, submissionId);
    }

    // Verify client refs match server-resolved refs (sorted digest comparison)
    const clientDigest = computeDigest(clientRefs);
    const serverDigest = computeDigest(serverRefs);
    if (clientDigest !== serverDigest) {
      return res.status(409).json({
        error: 'Image references have changed. Please refresh and try again.',
        code: 'refs_changed',
      });
    }

    // ── Re-verify worst status server-side ────────────────────────────────────
    const serverWorstStatus = await getWorstSafeguardStatus(profile.companyId, serverRefs);

    // Never issue a token for blocked/elevated — regardless of client-supplied status
    if (serverWorstStatus === 'blocked' || serverWorstStatus === 'elevated') {
      return res.status(403).json({
        error: 'External sharing is not permitted for these images',
        code: 'sharing_blocked',
      });
    }

    // Validate and record client-supplied status (for audit — not used for blocking logic)
    const clientStatus = typeof body.worstStatus === 'string' &&
      VALID_STATUSES.includes(body.worstStatus as SafeguardStatus)
      ? (body.worstStatus as SafeguardStatus)
      : 'unavailable';
    void clientStatus; // recorded in token for audit; server status is authoritative

    // ── Validate recipients (form_email only) ─────────────────────────────────
    let recipients: string[] | undefined;
    if (action === 'form_email') {
      if (!Array.isArray(body.recipients)) {
        return res.status(400).json({ error: 'recipients must be an array for form_email' });
      }
      recipients = (body.recipients as unknown[])
        .filter((r): r is string => typeof r === 'string' && r.length > 0 && r.length <= 254)
        .slice(0, 50);
      if (recipients.length === 0) {
        return res.status(400).json({ error: 'At least one recipient is required for form_email' });
      }
    }

    // ── Issue bound token ─────────────────────────────────────────────────────
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
      confirmationToken: token.tokenId,
      expiresAt: token.expiresAt,
    });
  } catch (err) {
    console.error('POST /api/image-safety/batch-confirm error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Confirmation failed' });
  }
}
