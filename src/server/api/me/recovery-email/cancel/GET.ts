/**
 * GET /api/me/recovery-email/cancel?token=<hex>
 *
 * CONFIRMATION STEP — does NOT cancel anything.
 *
 * Validates the token and redirects to a confirmation page where the user
 * must click a button that POSTs to /api/me/recovery-email/cancel to
 * complete the cancellation.
 *
 * This separation prevents link-prefetch, email-scanner, and CSRF attacks
 * from triggering a destructive action on a GET request.
 */
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { APP_URL } from '../../../../lib/app-url.js';

export default async function handler(req: Request, res: Response) {
  const token = typeof req.query['token'] === 'string' ? req.query['token'] : '';

  if (!token || token.length < 64) {
    return res.redirect(`${APP_URL}/settings?recovery_cancel_result=invalid`);
  }

  try {
    // Validate token exists and is not expired/used — do NOT mutate state
    const hash = createHash('sha256').update(token).digest('hex');
    const [[row]] = await db.execute(sql`
      SELECT cancel_token_expires_at, cancel_token_used_at, proposed_email
      FROM recovery_email_state
      WHERE cancel_token_hash = ${hash}
      LIMIT 1
    `) as unknown as [[{
      cancel_token_expires_at: Date | null;
      cancel_token_used_at:    Date | null;
      proposed_email:          string | null;
    } | undefined]];

    if (!row || !row.proposed_email) {
      return res.redirect(`${APP_URL}/settings?recovery_cancel_result=invalid`);
    }
    if (row.cancel_token_used_at) {
      return res.redirect(`${APP_URL}/settings?recovery_cancel_result=already_used`);
    }
    if (!row.cancel_token_expires_at || new Date() > row.cancel_token_expires_at) {
      return res.redirect(`${APP_URL}/settings?recovery_cancel_result=expired`);
    }

    // Token is valid — redirect to confirmation page with token in URL
    // The confirmation page renders a POST form; the action is performed by POST handler
    return res.redirect(
      `${APP_URL}/settings?recovery_cancel_confirm=1&token=${encodeURIComponent(token)}`
    );
  } catch (err) {
    console.error('[recovery-email/cancel GET]', err instanceof Error ? err.message : String(err));
    return res.redirect(`${APP_URL}/settings?recovery_cancel_result=error`);
  }
}
