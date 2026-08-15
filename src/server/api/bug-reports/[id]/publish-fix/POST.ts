/**
 * POST /api/bug-reports/:id/publish-fix
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform-owner only + valid publishToken (from sms-authorise).
 * Body: { publishToken: string, note?: string }
 *
 * What it does:
 * 1. Validates the HMAC-signed publishToken (30-min TTL, bug-id scoped).
 * 2. Calls the Airo publish API to trigger a production deploy.
 * 3. Updates the bug report status to 'in_progress' with a resolution note.
 * 4. Returns { ok: true, publishTriggered: true }.
 *
 * The Airo publish endpoint is the same one the builder UI uses.
 * It requires the AIRO_PUBLISH_TOKEN secret (platform-managed).
 */
import type { Request, Response } from 'express';
import { createHmac } from 'node:crypto';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';
import { getSecret } from '#airo/secrets';

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function verifyPublishToken(token: string, bugId: string): boolean {
  try {
    const secret = getSecret('BETTER_AUTH_SECRET') ?? 'fallback-secret';
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 4) return false;
    const [tokenBugId, , expiryStr, sig] = parts;
    if (tokenBugId !== bugId) return false;
    const expiry = parseInt(expiryStr ?? '0', 10);
    if (Date.now() > expiry) return false;
    const payload = `${tokenBugId}:${parts[1]}:${expiryStr}`;
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    return sig === expected;
  } catch {
    return false;
  }
}

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const { id } = req.params as { id: string };
    const { publishToken, note } = req.body as { publishToken?: string; note?: string };

    if (!id) return res.status(400).json({ error: 'Bug report ID required.' });
    if (!publishToken) return res.status(400).json({ error: 'Publish token required. Complete SMS authorisation first.' });

    // Validate the publish token
    if (!verifyPublishToken(publishToken, id)) {
      return res.status(403).json({ error: 'Invalid or expired publish token. Re-authorise via SMS.' });
    }

    // Fetch bug report to confirm it exists
    const [rows] = await db.execute(sql.raw(`
      SELECT id, ai_suggested_prompt FROM bug_reports WHERE id = '${esc(id)}' LIMIT 1
    `)) as unknown as [Array<{ id: string; ai_suggested_prompt: string | null }>, unknown];

    const report = rows?.[0];
    if (!report) return res.status(404).json({ error: 'Bug report not found.' });

    // Trigger Airo publish
    let publishTriggered = false;
    let publishError: string | null = null;

    try {
      const appId = process.env.AIRO_APP_ID ?? '';
      const publishApiToken = process.env.AIRO_PUBLISH_TOKEN ?? '';

      if (appId && publishApiToken) {
        const publishRes = await fetch(`https://api.c36.airoapp.ai/v1/apps/${appId}/publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${publishApiToken}`,
          },
          body: JSON.stringify({ reason: `Bug fix: ${id}` }),
          signal: AbortSignal.timeout(30_000),
        });

        if (publishRes.ok) {
          publishTriggered = true;
        } else {
          const text = await publishRes.text();
          publishError = `Publish API returned ${publishRes.status}: ${text.slice(0, 200)}`;
          console.error('[publish-fix] Airo publish error:', publishError);
        }
      } else {
        publishError = 'AIRO_APP_ID or AIRO_PUBLISH_TOKEN not configured.';
        console.warn('[publish-fix]', publishError);
      }
    } catch (publishErr) {
      publishError = String(publishErr);
      console.error('[publish-fix] Publish call failed:', publishErr);
    }

    // Update bug report status
    const resolutionNote = note?.trim()
      ? `${note.trim()} | Publish triggered: ${publishTriggered}`
      : `AI-assisted fix published via SMS authorisation. Publish triggered: ${publishTriggered}`;

    await db.execute(sql.raw(`
      UPDATE bug_reports
      SET status = 'in_progress',
          resolution_note = '${esc(resolutionNote)}',
          resolved_by_name = '${esc(ownerInfo.email)}',
          updated_at = NOW()
      WHERE id = '${esc(id)}'
    `));

    return res.json({
      ok: true,
      publishTriggered,
      publishError,
      message: publishTriggered
        ? 'Fix published to production successfully.'
        : `Publish could not be triggered automatically: ${publishError}. Bug report updated to in_progress.`,
    });
  } catch (err) {
    console.error('[bug-reports/publish-fix]', err);
    return res.status(500).json({ error: 'Publish failed.' });
  }
}
