/**
 * GET /api/secure-share/:token
 * Public endpoint — no login required.
 * Resolves a secure share link token and returns metadata + allowed actions.
 * Does NOT return file contents — only metadata.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { hashToken } from '../../../lib/share-tokens.js';

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params as { token: string };
    if (!token || token.length < 20) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    const tokenHash = hashToken(token);

    const [rows] = await db.execute(sql`
      SELECT
        sl.id, sl.company_id, sl.link_type, sl.target_type, sl.target_id,
        sl.title, sl.permissions_json, sl.metadata_json,
        sl.expires_at, sl.max_uses, sl.use_count, sl.revoked,
        sl.password_hash IS NOT NULL AS requires_password,
        sl.created_at
      FROM secure_share_links sl
      WHERE sl.token_hash = ${tokenHash}
      LIMIT 1
    `) as unknown as [Array<{
      id: number;
      company_id: number;
      link_type: string;
      target_type: string;
      target_id: string;
      title: string;
      permissions_json: string;
      metadata_json: string;
      expires_at: string | null;
      max_uses: number | null;
      use_count: number;
      revoked: number;
      requires_password: number;
      created_at: string;
    }>];

    if (!rows.length) {
      await logEvent(null, null, 'not_found', req);
      return res.status(404).json({ error: 'Link not found', code: 'NOT_FOUND' });
    }

    const link = rows[0];

    // Check revoked
    if (link.revoked) {
      await logEvent(link.id, link.company_id, 'revoked_attempt', req);
      return res.status(410).json({ error: 'This link has been revoked', code: 'REVOKED' });
    }

    // Check expiry
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      await logEvent(link.id, link.company_id, 'expired_attempt', req);
      return res.status(410).json({ error: 'This link has expired', code: 'EXPIRED' });
    }

    // Check max uses
    if (link.max_uses !== null && link.use_count >= link.max_uses) {
      await logEvent(link.id, link.company_id, 'expired_attempt', req);
      return res.status(410).json({ error: 'This link has reached its maximum uses', code: 'MAX_USES' });
    }

    // Log open event
    await logEvent(link.id, link.company_id, 'opened', req);

    // Increment use_count
    await db.execute(sql`
      UPDATE secure_share_links SET use_count = use_count + 1, updated_at = NOW()
      WHERE id = ${link.id}
    `);

    const permissions: string[] = JSON.parse(link.permissions_json || '["view"]');
    const metadata: Record<string, unknown> = JSON.parse(link.metadata_json || '{}');

    return res.json({
      id: link.id,
      link_type: link.link_type,
      target_type: link.target_type,
      target_id: link.target_id,
      title: link.title,
      permissions,
      metadata,
      expires_at: link.expires_at,
      requires_password: link.requires_password === 1,
      created_at: link.created_at,
    });
  } catch (err) {
    console.error('GET /api/secure-share/:token error:', err);
    return res.status(500).json({ error: 'Failed to resolve link' });
  }
}

async function logEvent(
  shareLinkId: number | null,
  companyId: number | null,
  eventType: string,
  req: Request,
) {
  try {
    if (!shareLinkId || !companyId) return;
    await db.execute(sql`
      INSERT INTO secure_share_events
        (share_link_id, company_id, event_type, ip_address, user_agent)
      VALUES
        (${shareLinkId}, ${companyId}, ${eventType},
         ${req.ip ?? null}, ${req.headers['user-agent']?.slice(0, 500) ?? null})
    `);
  } catch { /* non-fatal */ }
}
