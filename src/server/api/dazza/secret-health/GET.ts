/**
 * GET /api/dazza/secret-health
 * Platform-owner only.
 *
 * Reports presence (true/false) for every secret the platform depends on.
 * NEVER reports values, lengths, characters, or any value-derived information.
 *
 * Used to verify the shared secret adapter works after deployment without
 * exposing any secret content to logs, browser responses, or audit records.
 */
import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../lib/platform-owner-guard.js';
import { getSecret } from '#airo/secrets';

// All secrets the platform depends on — grouped by subsystem.
// Presence check only. Order is stable for diffing.
const SECRET_GROUPS: Record<string, string[]> = {
  dazza: [
    'DAZZA_V3_ENABLED',
    'DAZZA_OPENAI_MODEL',
  ],
  openai: [
    'OPENAI_API_KEY',
  ],
  github: [
    'GITHUB_DAZZA_READ_TOKEN',
  ],
  auth: [
    'BETTER_AUTH_SECRET',
  ],
  stripe: [
    'STRIPE_SECRET_KEY',
    'STRIPE_PUBLISHABLE_KEY',
    'STRIPE_PRICE_SOLO',
    'STRIPE_PRICE_PRO',
    'STRIPE_PRICE_TEAM',
    'STRIPE_SOLO_PRICE_ID',
    'STRIPE_PRO_PRICE_ID',
    'STRIPE_TEAM_PRICE_ID',
    'STRIPE_BUSINESS_PRICE_ID',
  ],
  storage: [
    'STORAGE_PROVIDER',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
  ],
  xero: [
    'XERO_CLIENT_ID',
    'XERO_CLIENT_SECRET',
    'XERO_REDIRECT_URI',
  ],
  qbo: [
    'QBO_CLIENT_ID',
    'QBO_CLIENT_SECRET',
    'QBO_REDIRECT_URI',
  ],
  twilio: [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
  ],
  push: [
    'VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
    'VAPID_SUBJECT',
  ],
  platform: [
    'PLATFORM_OWNER_EMAIL',
    'PLATFORM_OWNER_PHONE',
  ],
};

function isPresent(name: string): boolean {
  const v = getSecret(name);
  // Present = non-null. Empty string counts as present (key exists, value is empty).
  // Boolean true/false, number, object all count as present.
  return v !== null;
}

export default async function handler(req: Request, res: Response) {
  const ownerInfo = await getPlatformOwnerInfo(req);
  if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
  if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'forbidden' });

  const groups: Record<string, Record<string, boolean>> = {};
  let totalPresent = 0;
  let totalMissing = 0;

  for (const [group, names] of Object.entries(SECRET_GROUPS)) {
    groups[group] = {};
    for (const name of names) {
      const present = isPresent(name);
      groups[group][name] = present;
      if (present) totalPresent++; else totalMissing++;
    }
  }

  return res.json({
    ok: totalMissing === 0,
    summary: { present: totalPresent, missing: totalMissing },
    groups,
    // Confirm which config source was used (config.json vs process.env fallback)
    // by checking if a known-present secret resolves — presence only, no value.
    adapterSource: isPresent('BETTER_AUTH_SECRET') ? 'config.json-or-env' : 'unknown',
  });
}
