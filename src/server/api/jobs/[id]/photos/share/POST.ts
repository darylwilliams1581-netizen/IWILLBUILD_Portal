/**
 * POST /api/jobs/:id/photos/share
 * Generate a 90-day view-only share token for a job's photos.
 * Returns { shareUrl, expiresAt }
 *
 * CP12A7: Requires a valid safeguard confirmation token bound to:
 *   - authenticated company + user
 *   - action = 'share_link'
 *   - exact set of job photos at time of confirmation
 *
 * Strategy: DELETE any existing share for this job, then INSERT fresh.
 * This avoids relying on onDuplicateKeyUpdate for the job_id unique index
 * which may not exist on older DB instances.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { jobPhotoShares, profiles, jobs } from '../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { generateShareToken, hashToken, expiresAt } from '../../../../../lib/share-tokens.js';
import {
  resolveJobPhotoRefs,
  consumeConfirmationToken,
} from '../../../../../lib/imageSafeguardService.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const jobId = parseInt(String(req.params.id), 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // ── CP12A7: Enforce safeguard confirmation token ───────────────────────────
    const body = req.body as { safeguardToken?: unknown };
    const safeguardToken = typeof body.safeguardToken === 'string' ? body.safeguardToken.trim() : '';
    if (!safeguardToken) {
      return res.status(403).json({
        error: 'A safeguard confirmation is required before sharing photos.',
        code: 'safeguard_token_required',
      });
    }

    // Resolve the exact photo refs at the moment of the share request
    const currentRefs = await resolveJobPhotoRefs(profile.companyId, jobId);

    // Consume the token — validates all bindings atomically
    const consumeResult = await consumeConfirmationToken({
      tokenId: safeguardToken,
      companyId: profile.companyId,
      userId: session.user.id,
      action: 'share_link',
      storageRefs: currentRefs,
    });

    if (!consumeResult.ok) {
      const statusMap: Record<string, number> = {
        missing: 404,
        expired: 410,
        used: 409,
        wrong_company: 403,
        wrong_user: 403,
        wrong_refs: 409,
        wrong_recipients: 409,
        blocked: 403,
        db_error: 500,
      };
      const status = statusMap[consumeResult.reason] ?? 403;
      const messages: Record<string, string> = {
        missing: 'Confirmation token not found.',
        expired: 'Confirmation has expired. Please confirm again.',
        used: 'Confirmation has already been used.',
        wrong_company: 'Confirmation is not valid for this account.',
        wrong_user: 'Confirmation is not valid for this user.',
        wrong_refs: 'The photo selection has changed since confirmation. Please confirm again.',
        wrong_recipients: 'Recipients have changed since confirmation.',
        blocked: 'Sharing is not permitted for these images.',
        db_error: 'Confirmation verification failed.',
      };
      return res.status(status).json({
        error: messages[consumeResult.reason] ?? 'Confirmation invalid.',
        code: `safeguard_${consumeResult.reason}`,
      });
    }

    // ── Generate share link ───────────────────────────────────────────────────
    const raw = generateShareToken();
    const hash = hashToken(raw);
    const exp = expiresAt(90);

    // Delete any existing share for this job, then insert fresh.
    await db.delete(jobPhotoShares).where(
      and(
        eq(jobPhotoShares.jobId, jobId),
        eq(jobPhotoShares.companyId, profile.companyId),
      )
    );

    await db.insert(jobPhotoShares).values({
      jobId,
      companyId: profile.companyId,
      tokenHash: hash,
      expiresAt: exp,
      createdByUserId: session.user.id,
    });

    const origin = `${req.protocol}://${req.get('host')}`;
    const shareUrl = `${origin}/photos/share/${raw}`;

    res.json({ shareUrl, expiresAt: exp.toISOString() });
  } catch (error) {
    console.error('POST /api/jobs/:id/photos/share error:', error);
    res.status(500).json({ error: 'Failed to generate share link' });
  }
}
