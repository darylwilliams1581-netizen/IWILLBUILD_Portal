/**
 * GET /api/secure-share?targetType=&targetId=
 * ─────────────────────────────────────────────────────────────────────────────
 * List all share links for a given target (authenticated, company-scoped).
 * Returns links with status, use counts, expiry — never the raw token.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { resolveEffectiveCompany } from '../../lib/dazza-context.js';

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

    let rows: Array<Record<string, unknown>>;

    if (targetType && targetId) {
      const [r] = await db.execute(sql`
        SELECT id, link_type AS linkType, target_type AS targetType, target_id AS targetId,
               title, permissions_json AS permissionsJson, expires_at AS expiresAt,
               max_uses AS maxUses, use_count AS useCount,
               revoked, created_at AS createdAt, updated_at AS updatedAt,
               (password_hash IS NOT NULL) AS hasPassword
        FROM secure_share_links
        WHERE company_id = ${companyId}
          AND target_type = ${targetType}
          AND target_id = ${targetId}
        ORDER BY created_at DESC
        LIMIT 50
      `) as unknown as [Array<Record<string, unknown>>, unknown];
      rows = r ?? [];
    } else {
      // Return all links for the company (admin view)
      const [r] = await db.execute(sql`
        SELECT id, link_type AS linkType, target_type AS targetType, target_id AS targetId,
               title, permissions_json AS permissionsJson, expires_at AS expiresAt,
               max_uses AS maxUses, use_count AS useCount,
               revoked, created_at AS createdAt, updated_at AS updatedAt,
               (password_hash IS NOT NULL) AS hasPassword
        FROM secure_share_links
        WHERE company_id = ${companyId}
        ORDER BY created_at DESC
        LIMIT 200
      `) as unknown as [Array<Record<string, unknown>>, unknown];
      rows = r ?? [];
    }

    const links = rows.map((row) => ({
      id: row.id,
      linkType: row.linkType,
      targetType: row.targetType,
      targetId: row.targetId,
      title: row.title,
      permissions: (() => {
        try { return JSON.parse(row.permissionsJson as string) as string[]; }
        catch { return []; }
      })(),
      expiresAt: row.expiresAt ? String(row.expiresAt) : null,
      maxUses: row.maxUses ?? null,
      useCount: Number(row.useCount ?? 0),
      revoked: Boolean(row.revoked),
      hasPassword: Boolean(row.hasPassword),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      // Derived status
      status: (() => {
        if (Boolean(row.revoked)) return 'revoked';
        if (row.expiresAt && new Date(String(row.expiresAt)) < new Date()) return 'expired';
        if (row.maxUses !== null && Number(row.useCount) >= Number(row.maxUses)) return 'maxed';
        return 'active';
      })(),
    }));

    return res.json({ links });
  } catch (e) {
    console.error('GET /api/secure-share error:', e);
    return res.status(500).json({ error: 'Failed to load share links' });
  }
}
