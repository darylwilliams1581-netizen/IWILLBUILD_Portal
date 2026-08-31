/**
 * GET /api/me/recovery-email/freeze?token=<hex>
 *
 * CONFIRMATION STEP — does NOT freeze anything.
 *
 * Validates the token and redirects to a confirmation page where the user
 * must click a button that POSTs to /api/me/recovery-email/freeze to
 * complete the account freeze.
 *
 * Account freezing is irreversible via self-service (requires support).
 * Performing it on a GET would allow email scanners, link prefetchers, and
 * CSRF attacks to freeze accounts without user intent.
 */
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { APP_URL } from '../../../../lib/app-url.js';

export default async function handler(req: Request, res: Response) {
  const token = typeof req.query['token'] === 'string' ? req.query['token'] : '';

  if (!token || token.length < 64) {
    return res.redirect(`${APP_URL}/settings?recovery_freeze_result=invalid`);
  }

  try {
    // Validate token exists and is not expired/used — do NOT mutate state
    const hash = createHash('sha256').update(token).digest('hex');
    const [[row]] = await db.execute(sql`
      SELECT freeze_token_expires_at, freeze_token_used_at, frozen_at
      FROM recovery_email_state
      WHERE freeze_token_hash = ${hash}
      LIMIT 1
    `) as unknown as [[{
      freeze_token_expires_at: Date | null;
      freeze_token_used_at:    Date | null;
      frozen_at:               Date | null;
    } | undefined]];

    if (!row) {
      return res.redirect(`${APP_URL}/settings?recovery_freeze_result=invalid`);
    }
    if (row.frozen_at) {
      return res.redirect(`${APP_URL}/settings?recovery_freeze_result=already_frozen`);
    }
    if (row.freeze_token_used_at) {
      return res.redirect(`${APP_URL}/settings?recovery_freeze_result=already_used`);
    }
    if (!row.freeze_token_expires_at || new Date() > row.freeze_token_expires_at) {
      return res.redirect(`${APP_URL}/settings?recovery_freeze_result=expired`);
    }

    // Token is valid — redirect to confirmation page with token in URL
    // The confirmation page renders a POST form; the action is performed by POST handler
    return res.redirect(
      `${APP_URL}/settings?recovery_freeze_confirm=1&token=${encodeURIComponent(token)}`
    );
  } catch (err) {
    console.error('[recovery-email/freeze GET]', err instanceof Error ? err.message : String(err));
    return res.redirect(`${APP_URL}/settings?recovery_freeze_result=error`);
  }
}
