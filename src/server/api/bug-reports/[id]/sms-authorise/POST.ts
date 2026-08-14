/**
 * POST /api/bug-reports/:id/sms-authorise
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform-owner only.
 * Validates the 6-digit SMS code against the stored hash.
 * On success: marks token as used, returns { ok: true, publishToken: <jwt-like> }
 * The publishToken is a short-lived HMAC-signed string used to authorise
 * the publish-fix endpoint without requiring the SMS code again.
 */
import type { Request, Response } from 'express';
import { createHash, createHmac } from 'node:crypto';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';
import { getSecret } from '#airo/secrets';

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function signPublishToken(bugId: string, userId: string): string {
  const secret = getSecret('BETTER_AUTH_SECRET') ?? 'fallback-secret';
  const payload = `${bugId}:${userId}:${Date.now() + 30 * 60 * 1000}`; // 30 min
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const { id } = req.params as { id: string };
    const { code } = req.body as { code?: string };

    if (!id) return res.status(400).json({ error: 'Bug report ID required.' });
    if (!code?.trim()) return res.status(400).json({ error: 'SMS code required.' });

    // Fetch the stored token
    const [rows] = await db.execute(sql.raw(`
      SELECT sms_auth_token, sms_auth_expires_at, sms_auth_used
      FROM bug_reports
      WHERE id = '${esc(id)}'
      LIMIT 1
    `)) as unknown as [Array<{
      sms_auth_token: string | null;
      sms_auth_expires_at: string | null;
      sms_auth_used: number | null;
    }>, unknown];

    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: 'Bug report not found.' });
    if (!row.sms_auth_token) return res.status(400).json({ error: 'No SMS code has been issued for this report. Run analysis first.' });
    if (row.sms_auth_used) return res.status(400).json({ error: 'SMS code already used.' });

    // Check expiry
    const expiresAt = row.sms_auth_expires_at ? new Date(row.sms_auth_expires_at) : null;
    if (!expiresAt || expiresAt < new Date()) {
      return res.status(400).json({ error: 'SMS code has expired. Re-run analysis to get a new code.' });
    }

    // Validate code
    const inputHash = hashCode(code.trim());
    if (inputHash !== row.sms_auth_token) {
      return res.status(400).json({ error: 'Invalid SMS code.' });
    }

    // Mark as used
    await db.execute(sql.raw(`
      UPDATE bug_reports
      SET sms_auth_used = 1, updated_at = NOW()
      WHERE id = '${esc(id)}'
    `));

    // Issue publish token
    const publishToken = signPublishToken(id, ownerInfo.userId);

    return res.json({ ok: true, publishToken });
  } catch (err) {
    console.error('[bug-reports/sms-authorise]', err);
    return res.status(500).json({ error: 'Authorisation failed.' });
  }
}
