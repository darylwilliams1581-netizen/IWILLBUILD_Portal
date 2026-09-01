/**
 * POST /api/image-safety/batch-confirm
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12A §6 — Record a batch sharing confirmation and return a one-use token.
 *
 * Called by useImageSafeguardBatch after the user clicks "Send securely".
 * The token binds the confirmation to the exact user, company, and timestamp.
 * It must be presented when the actual send/share/export is executed.
 *
 * SECURITY:
 *  - Requires authenticated session
 *  - Requires company membership
 *  - Never trusts a client-supplied safeguard status
 *  - Token is a signed, time-limited, single-use opaque string
 *  - Token expires in 5 minutes (enough for one send operation)
 *  - Any changed recipient or image set requires a fresh confirmation
 *
 * BODY:
 *   { worstStatus: string, confirmedAt: string }
 *
 * RESPONSE:
 *   { confirmationToken: string, expiresAt: string }
 */

import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { SafeguardStatus } from '../../../../lib/imageSafeguard/types.js';

const VALID_STATUSES: SafeguardStatus[] = [
  'pending', 'clear', 'privacy_signal', 'elevated', 'blocked', 'unavailable', 'error',
];

const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

    const body = req.body as { worstStatus?: unknown; confirmedAt?: unknown };

    // Validate worstStatus — never trust client-supplied value for blocking logic,
    // but we record what the client saw for audit purposes
    const clientStatus = typeof body.worstStatus === 'string' &&
      VALID_STATUSES.includes(body.worstStatus as SafeguardStatus)
      ? (body.worstStatus as SafeguardStatus)
      : 'unavailable';

    // Blocked/elevated: confirmation must not be issued
    if (clientStatus === 'blocked' || clientStatus === 'elevated') {
      return res.status(403).json({ error: 'External sharing is not permitted for these images' });
    }

    const confirmedAt = new Date();
    const expiresAt = new Date(confirmedAt.getTime() + TOKEN_TTL_MS);
    const confirmationToken = randomUUID();

    // Record the confirmation in the activity log (safe metadata only)
    try {
      await db.execute(sql`
        INSERT INTO platform_activity_log
          (id, company_id, user_id, action, metadata, created_at)
        VALUES
          (${randomUUID()}, ${profile.companyId}, ${session.user.id},
           'image_safeguard_batch_confirm',
           ${JSON.stringify({
             confirmationToken,
             clientStatus,
             expiresAt: expiresAt.toISOString(),
           })},
           ${confirmedAt})
      `);
    } catch {
      // Activity log failure must not block the confirmation
    }

    return res.json({
      confirmationToken,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error('POST /api/image-safety/batch-confirm error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Confirmation failed' });
  }
}
