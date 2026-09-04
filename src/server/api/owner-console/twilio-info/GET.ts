/**
 * GET /api/owner-console/twilio-info
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns the Twilio Account SID (non-secret identifier) and pre-built console
 * deep-link URLs for the Owner Console TwilioTab.
 *
 * The SID is read server-side from the TWILIO_ACCOUNT_SID secret so it never
 * appears in client-side source code or the compiled JS bundle.
 *
 * Auth: platform-owner only (requirePlatformOwner middleware applied in entry.ts)
 * Never returns TWILIO_AUTH_TOKEN or any other credential.
 */
import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';

export default async function handler(_req: Request, res: Response) {
  const sid = getSecret('TWILIO_ACCOUNT_SID') ?? '';

  if (!sid) {
    return res.status(503).json({
      error: 'twilio_not_configured',
      message: 'TWILIO_ACCOUNT_SID secret is not set.',
    });
  }

  // Build console deep-links. All URLs are deterministic from the SID.
  const links = [
    {
      label: 'Twilio Console — Account Home',
      description: 'Main dashboard for your Twilio account.',
      url: 'https://console.twilio.com/us1/account/manage-account/general-settings',
      highlight: true,
    },
    {
      label: 'Verified Caller IDs (Trial)',
      description:
        'Add phone numbers that can receive SMS on your trial account. Required before SMS verification will work for any number.',
      url: 'https://console.twilio.com/us1/develop/phone-numbers/manage/verified',
      highlight: true,
    },
    {
      label: 'SMS Logs',
      description: 'View sent and received SMS messages, delivery status, and errors.',
      url: 'https://console.twilio.com/us1/monitor/logs/sms',
      highlight: false,
    },
    {
      label: 'Phone Numbers',
      description: 'Manage your Twilio phone numbers (the number SMS is sent from).',
      url: 'https://console.twilio.com/us1/develop/phone-numbers/manage/incoming',
      highlight: false,
    },
    {
      label: 'Billing & Upgrade',
      description:
        'Upgrade from trial to a paid account to remove the verified-number restriction and send SMS to any number.',
      url: 'https://console.twilio.com/us1/billing/manage-billing/billing-overview',
      highlight: false,
    },
  ];

  return res.json({ accountSid: sid, links });
}
