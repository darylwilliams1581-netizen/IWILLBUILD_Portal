/**
 * POST /api/image-safety/attest
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A — Receive an image upload attestation from the client.
 *
 * Called AFTER the user confirms the safety modal, BEFORE the file is uploaded
 * to storage. The attestation token returned here is passed as the
 * X-Safety-Attestation header on the subsequent upload request.
 *
 * SECURITY:
 *  - Requires authenticated session (401 if not logged in)
 *  - Requires company membership (403 if no company)
 *  - Validates the request body shape before writing
 *  - Never logs raw image bytes, signed URLs, or credential information
 *  - Token is a random UUID — it references the audit row, not the image
 *
 * IDEMPOTENCY:
 *  - clientUploadId is unique per file selection; duplicate POSTs with the
 *    same clientUploadId are accepted (the audit row is written once per
 *    unique token, and the same token is returned for duplicates via the
 *    activity log lookup).
 *
 * BODY (JSON):
 *   AttestationContext — see src/lib/imageSafety/types.ts
 *
 * RESPONSE:
 *   { token: string, recordedAt: string }
 */

import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { recordImageSafetyAttestation } from '../../../lib/imageSafetyAudit.js';
import type { AttestationContext } from '../../../../lib/imageSafety/types.js';

export default async function handler(req: Request, res: Response) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
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

    // ── Validate body ─────────────────────────────────────────────────────────
    const body = req.body as Partial<AttestationContext>;

    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid request body' });
    }
    if (typeof body.clientUploadId !== 'string' || !body.clientUploadId) {
      return res.status(400).json({ error: 'clientUploadId required' });
    }
    if (!body.scanResult || typeof body.scanResult !== 'object') {
      return res.status(400).json({ error: 'scanResult required' });
    }
    if (typeof body.surface !== 'string' || !body.surface) {
      return res.status(400).json({ error: 'surface required' });
    }
    if (typeof body.policyVersion !== 'string' || !body.policyVersion) {
      return res.status(400).json({ error: 'policyVersion required' });
    }
    if (typeof body.confirmedAt !== 'string' || !body.confirmedAt) {
      return res.status(400).json({ error: 'confirmedAt required' });
    }

    // Validate scanResult shape (safe fields only)
    const sr = body.scanResult;
    const validStatuses = ['clear', 'privacy_warning', 'blocked', 'unavailable'];
    if (!validStatuses.includes(sr.status ?? '')) {
      return res.status(400).json({ error: 'Invalid scanResult.status' });
    }

    // ── Generate token ────────────────────────────────────────────────────────
    const token = randomUUID();
    const recordedAt = new Date().toISOString();

    // ── Write audit record ────────────────────────────────────────────────────
    const context: AttestationContext = {
      clientUploadId: body.clientUploadId,
      scanResult:     body.scanResult,
      jobId:          typeof body.jobId === 'number' ? body.jobId : null,
      submissionId:   typeof body.submissionId === 'number' ? body.submissionId : null,
      surface:        body.surface,
      policyVersion:  body.policyVersion,
      confirmedAt:    body.confirmedAt,
    };

    await recordImageSafetyAttestation({
      token,
      userId:    session.user.id,
      companyId: profile.companyId,
      context,
    });

    return res.status(201).json({ token, recordedAt });
  } catch (err) {
    console.error('POST /api/image-safety/attest error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to record attestation' });
  }
}
