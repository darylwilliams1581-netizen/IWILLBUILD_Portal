/**
 * GET /api/secure-share/:token
 * ─────────────────────────────────────────────────────────────────────────────
 * Public endpoint — no login required.
 * Resolves a raw share token, validates it, and returns link metadata.
 * Does NOT return the target content — just the link metadata so the
 * public share page can decide what to render.
 *
 * Security:
 * - Token is SHA-256 hashed before DB lookup (raw token never stored)
 * - Checks revoked, expiry, max_uses
 * - Logs every access attempt
 * - Returns requiresPassword: true if password_hash is set (without revealing hash)
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { hashToken } from '../../../lib/share-tokens.js';

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params as { token: string };
    if (!token || token.length < 20) {
      return res.status(400).json({ error: 'Invalid token', code: 'INVALID' });
    }

    const tokenHash = hashToken(token);

    const [rows] = await db.execute(sql`
      SELECT id, company_id, link_type, target_type, target_id,
             title, permissions_json, metadata_json,
             expires_at, password_hash, max_uses, use_count,
             revoked, created_at
      FROM secure_share_links
      WHERE token_hash = ${tokenHash}
      LIMIT 1
    `) as unknown as [Array<{
      id: number;
      company_id: number;
      link_type: string;
      target_type: string;
      target_id: string;
      title: string;
      permissions_json: string | null;
      metadata_json: string | null;
      expires_at: string | null;
      password_hash: string | null;
      max_uses: number | null;
      use_count: number;
      revoked: number;
      created_at: string;
    }>, unknown];

    const link = rows?.[0];

    if (!link) {
      return res.status(404).json({ error: 'This link does not exist or has been removed.', code: 'NOT_FOUND' });
    }

    // Check revoked
    if (link.revoked) {
      await logEvent(link.id, link.company_id, 'revoked_attempt', req);
      return res.status(410).json({ error: 'This link has been revoked.', code: 'REVOKED' });
    }

    // Check expiry
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      await logEvent(link.id, link.company_id, 'expired_attempt', req);
      return res.status(410).json({ error: 'This link has expired.', code: 'EXPIRED' });
    }

    // Check max uses
    if (link.max_uses !== null && link.use_count >= link.max_uses) {
      await logEvent(link.id, link.company_id, 'expired_attempt', req);
      return res.status(410).json({ error: 'This link has reached its maximum number of uses.', code: 'MAX_USES' });
    }

    // Log opened event — do NOT increment use_count here.
    // use_count is incremented only when content is actually delivered
    // (view or download via GET /api/secure-share/:token/content).
    // Incrementing on every metadata probe causes double-counting when
    // the share page probes first and the viewer fetches again.
    await logEvent(link.id, link.company_id, 'opened', req);

    let permissions: string[] = ['view'];
    try {
      if (link.permissions_json) permissions = JSON.parse(link.permissions_json) as string[];
    } catch { /* use default */ }

    let metadata: Record<string, unknown> | null = null;
    try {
      if (link.metadata_json) metadata = JSON.parse(link.metadata_json) as Record<string, unknown>;
    } catch { /* ignore */ }

    return res.json({
      id: link.id,
      linkType: link.link_type,
      targetType: link.target_type,
      targetId: link.target_id,
      title: link.title,
      permissions,
      metadata,
      expiresAt: link.expires_at ?? null,
      maxUses: link.max_uses ?? null,
      useCount: link.use_count, // actual count — incremented only on content delivery
      requiresPassword: !!link.password_hash,
      createdAt: link.created_at,
    });
  } catch (e) {
    console.error('GET /api/secure-share/:token error:', e);
    return res.status(500).json({ error: 'Failed to load share link' });
  }
}

async function logEvent(
  shareLinkId: number,
  companyId: number,
  eventType: string,
  req: Request,
): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO secure_share_events
        (share_link_id, company_id, event_type, ip_address, user_agent, created_at)
      VALUES
        (${shareLinkId}, ${companyId}, ${eventType},
         ${req.ip ?? null}, ${(req.headers['user-agent'] ?? '').slice(0, 500)}, NOW())
    `);
  } catch { /* best-effort */ }
}
