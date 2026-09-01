/**
 * PATCH /api/owner-console/image-safeguard/findings/:id
 * ─────────────────────────────────────────────────────────────────────────────
 * CP12B2 — Mark a finding as reviewed and record a short factual note.
 *
 * REQUEST BODY:
 *   reviewed:      boolean (required)
 *   reviewerNote:  string (optional, max 500 chars)
 *
 * SECURITY:
 *  - Platform-owner access only (requirePlatformOwner middleware in entry.ts).
 *  - Reviewer identity resolved from session — never from request body.
 *  - Note is sanitized: max 500 chars, no HTML.
 *  - No conclusions about criminal conduct may be stored.
 *  - No R2 keys, signed URLs, or image bytes returned.
 *  - Sanitized errors only.
 *
 * AUDIT:
 *  - Review action recorded in platform_activity_log after DB update succeeds.
 *  - Audit includes: reviewerId, findingId, reviewed, timestamp.
 *  - No image content, R2 keys, or URLs in audit.
 */

import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getAuth } from '../../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const findingId = String(req.params.id ?? '').trim();
    if (!findingId || !/^[0-9a-f-]{36}$/i.test(findingId)) {
      return res.status(400).json({ error: 'invalid_finding_id', message: 'Invalid finding ID.' });
    }

    const body = req.body as { reviewed?: boolean; reviewerNote?: string } | undefined;
    if (typeof body?.reviewed !== 'boolean') {
      return res.status(400).json({ error: 'reviewed_required', message: '`reviewed` (boolean) is required.' });
    }

    // Sanitize note: strip HTML tags, max 500 chars
    const rawNote = String(body.reviewerNote ?? '').trim();
    const reviewerNote = rawNote.replace(/<[^>]*>/g, '').slice(0, 500);

    // Resolve reviewer identity from session
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    const reviewerId = session?.user?.id ?? 'unknown';

    const now = new Date().toISOString();

    // Verify finding exists
    const existing = await db.execute(sql`
      SELECT id FROM image_safeguard_findings WHERE id = ${findingId}
    `);
    if ((existing as unknown as unknown[]).length === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Finding not found.' });
    }

    // Update finding
    await db.execute(sql`
      UPDATE image_safeguard_findings
      SET reviewed     = ${body.reviewed ? 1 : 0},
          reviewer_id  = ${reviewerId},
          reviewed_at  = ${now},
          reviewer_note= ${reviewerNote || null}
      WHERE id = ${findingId}
    `);

    // Audit after successful DB update
    try {
      await db.execute(sql`
        INSERT INTO platform_activity_log
          (id, company_id, user_id, action, resource_type, resource_id, metadata, created_at)
        VALUES
          (${randomUUID()}, 0, ${reviewerId}, 'safeguard_finding_reviewed',
           'safeguard_finding', ${findingId},
           ${JSON.stringify({ reviewed: body.reviewed, timestamp: now })},
           ${now})
      `);
    } catch {
      // Audit failure must not affect the response
    }

    return res.json({ ok: true, findingId, reviewed: body.reviewed, reviewedAt: now });
  } catch {
    return res.status(500).json({ error: 'Failed to update finding.' });
  }
}
