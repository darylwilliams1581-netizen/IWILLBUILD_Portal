/**
 * GET /api/me/recovery-email/freeze?token=<hex>
 *
 * Called when the OLD address owner clicks the freeze link in the notification email.
 * Freezes the account, revokes ALL sessions, and cancels the pending change.
 * Redirects to a result page — never exposes the token in the response body.
 */
import type { Request, Response } from 'express';
import { freezeAccountViaToken } from '../../../../lib/recovery-email-service.js';
import { getIp, getUserAgent } from '../../../../lib/activity-log.js';
import { APP_URL } from '../../../../lib/app-url.js';

export default async function handler(req: Request, res: Response) {
  const token = typeof req.query['token'] === 'string' ? req.query['token'] : '';

  if (!token) {
    return res.redirect(`${APP_URL}/settings?recovery_freeze_result=invalid`);
  }

  try {
    const result = await freezeAccountViaToken({
      token,
      ipAddress: getIp(req),
      userAgent: getUserAgent(req) ?? undefined,
    });

    if (!result.ok) {
      const code = result.code.toLowerCase();
      return res.redirect(`${APP_URL}/settings?recovery_freeze_result=${code}`);
    }

    // Account frozen — redirect to login (all sessions revoked)
    return res.redirect(`${APP_URL}/login?recovery_freeze_result=frozen`);
  } catch (err) {
    console.error('[recovery-email/freeze]', err instanceof Error ? err.message : String(err));
    return res.redirect(`${APP_URL}/settings?recovery_freeze_result=error`);
  }
}
