/**
 * GET /api/secure-share/active?targetType=&targetId=
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns ALL active (non-revoked, non-expired) share links for a given target,
 * including the decrypted share URL for each so the modal can display them
 * without creating a new link.
 *
 * If exactly one active link exists → normal display.
 * If more than one active link exists → returns all with a `duplicates: true`
 * flag so the UI can show the "Multiple active links" warning and let the owner
 * choose which to keep.
 *
 * Never returns: token_hash, token_encrypted, password_hash, or any
 * encryption metadata.
 *
 * Authentication: session required; company-scoped.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { resolveEffectiveCompany } from '../../../lib/dazza-context.js';
import { decryptToken } from '../../../lib/share-tokens.js';
import { APP_URL } from '../../../lib/app-url.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const { companyId } = await resolveEffectiveCompany(req, session.user.id);
    if (!companyId) return res.status(400).json({ error: 'No company' });

    const { targetType, targetId } = req.query as { targetType?: string; targetId?: string };
    if (!targetType || !targetId) {
      return res.status(400).json({ error: 'targetType and targetId are required' });
    }

    const [rows] = await db.execute(sql`
      SELECT id, link_type AS linkType, target_type AS targetType, target_id AS targetId,
             title, permissions_json AS permissionsJson, expires_at AS expiresAt,
             max_uses AS maxUses, use_count AS useCount,
             (password_hash IS NOT NULL) AS hasPassword,
             token_encrypted AS tokenEncrypted,
             created_at AS createdAt, updated_at AS updatedAt
      FROM secure_share_links
      WHERE company_id = ${companyId}
        AND target_type = ${targetType}
        AND target_id   = ${String(targetId)}
        AND revoked     = 0
        AND (expires_at IS NULL OR expires_at > NOW())
        AND (max_uses IS NULL OR use_count < max_uses)
      ORDER BY created_at DESC
      LIMIT 10
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    const links = (rows ?? []).map((row) => {
      const enc = row.tokenEncrypted as string | null;
      const rawToken = enc ? decryptToken(enc) : null;
      const shareUrl = rawToken ? `${APP_URL}/share/${rawToken}` : null;

      return {
        id: row.id as number,
        linkType: row.linkType as string,
        targetType: row.targetType as string,
        targetId: row.targetId as string,
        title: row.title as string,
        permissions: (() => {
          try { return JSON.parse(row.permissionsJson as string) as string[]; }
          catch { return [] as string[]; }
        })(),
        expiresAt: row.expiresAt ? String(row.expiresAt) : null,
        maxUses: row.maxUses != null ? Number(row.maxUses) : null,
        useCount: Number(row.useCount ?? 0),
        hasPassword: Boolean(row.hasPassword),
        shareUrl,
        // shareUrl is null only if token_encrypted is missing (pre-migration rows)
        urlRecoverable: shareUrl !== null,
        createdAt: row.createdAt ? String(row.createdAt) : null,
        updatedAt: row.updatedAt ? String(row.updatedAt) : null,
      };
    });

    return res.json({
      links,
      count: links.length,
      duplicates: links.length > 1,
    });
  } catch (e) {
    console.error('GET /api/secure-share/active error:', e);
    return res.status(500).json({ error: 'Failed to load active links' });
  }
}
