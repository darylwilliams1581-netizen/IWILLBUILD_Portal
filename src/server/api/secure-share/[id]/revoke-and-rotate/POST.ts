/**
 * POST /api/secure-share/:id/revoke-and-rotate
 * ─────────────────────────────────────────────────────────────────────────────
 * Atomically revokes the specified link and creates a new one for the same
 * target with the same (or caller-supplied) settings.
 *
 * Also revokes any other active duplicate links for the same target so the
 * result is always exactly one active link.
 *
 * Body (all optional — defaults to the revoked link's settings):
 *   permissions?  string[]
 *   expiryDays?   number  (0 = no expiry)
 *   password?     string
 *   maxUses?      number
 *
 * Returns the new share URL.
 * Authentication: session required; company-scoped.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { resolveEffectiveCompany } from '../../../../lib/dazza-context.js';
import { generateShareToken, hashToken, encryptToken } from '../../../../lib/share-tokens.js';
import { APP_URL } from '../../../../lib/app-url.js';

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

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const { permissions: newPermissions, expiryDays, password, maxUses } = req.body as {
      permissions?: string[];
      expiryDays?: number;
      password?: string;
      maxUses?: number;
    };

    const result = await db.transaction(async (tx) => {
      // Lock and fetch the target link
      const [rows] = await tx.execute(sql`
        SELECT id, target_type AS targetType, target_id AS targetId,
               title, link_type AS linkType, permissions_json AS permissionsJson,
               expires_at AS expiresAt, max_uses AS maxUses
        FROM secure_share_links
        WHERE id = ${id} AND company_id = ${companyId}
        LIMIT 1
        FOR UPDATE
      `) as unknown as [Array<Record<string, unknown>>, unknown];

      if (!rows?.[0]) return null;
      const old = rows[0];

      const targetType = old.targetType as string;
      const targetId   = old.targetId as string;

      // Revoke the specified link
      await tx.execute(sql`
        UPDATE secure_share_links
        SET revoked = 1, updated_at = NOW()
        WHERE id = ${id} AND company_id = ${companyId}
      `);

      // Log revocation
      await tx.execute(sql`
        INSERT INTO secure_share_events
          (share_link_id, company_id, event_type, ip_address, user_agent, created_at)
        VALUES
          (${id}, ${companyId}, 'revoked',
           ${req.ip ?? null}, ${(req.headers['user-agent'] ?? '').slice(0, 500)}, NOW())
      `);

      // Also revoke any other active duplicates for the same target
      await tx.execute(sql`
        UPDATE secure_share_links
        SET revoked = 1, updated_at = NOW()
        WHERE company_id = ${companyId}
          AND target_type = ${targetType}
          AND target_id   = ${targetId}
          AND revoked     = 0
          AND id != ${id}
      `);

      // Resolve settings — use caller-supplied or fall back to old link's settings
      const resolvedPermissions: string[] = newPermissions ?? (() => {
        try { return JSON.parse(old.permissionsJson as string) as string[]; }
        catch { return ['view', 'download']; }
      })();

      let passwordHash: string | null = null;
      if (password && password.trim()) {
        const { default: bcrypt } = await import('bcryptjs');
        passwordHash = await bcrypt.hash(password.trim(), 10);
      }

      let expiresAt: string | null = null;
      if (expiryDays !== undefined) {
        if (expiryDays > 0) {
          const d = new Date();
          d.setDate(d.getDate() + expiryDays);
          expiresAt = d.toISOString().slice(0, 19).replace('T', ' ');
        }
        // expiryDays === 0 → no expiry (null)
      } else if (old.expiresAt) {
        // Preserve original expiry if caller didn't specify
        expiresAt = String(old.expiresAt);
      }

      // Create new token
      const rawToken = generateShareToken();
      const tokenHash = hashToken(rawToken);
      const tokenEncrypted = encryptToken(rawToken);

      const permissionsJson = JSON.stringify(resolvedPermissions);
      const metadataJson = JSON.stringify({
        rail_type: 'secure_share_link',
        target_module: targetType,
        target_id: targetId,
        allowed_actions: resolvedPermissions,
        rotated_from: id,
        security: { expires: !!expiresAt, password_required: !!passwordHash, audit_logged: true },
      });

      const [insertResult] = await tx.execute(sql`
        INSERT INTO secure_share_links
          (company_id, created_by_user_id, token_hash, token_encrypted,
           link_type, target_type, target_id,
           title, permissions_json, metadata_json, expires_at, password_hash, max_uses,
           use_count, revoked, created_at, updated_at)
        VALUES
          (${companyId}, ${session.user.id}, ${tokenHash}, ${tokenEncrypted},
           ${old.linkType as string}, ${targetType}, ${targetId},
           ${old.title as string}, ${permissionsJson}, ${metadataJson},
           ${expiresAt}, ${passwordHash}, ${maxUses ?? null},
           0, 0, NOW(), NOW())
      `) as unknown as [{ insertId: number }, unknown];

      const newId = (insertResult as { insertId: number }).insertId;
      const shareUrl = `${APP_URL}/share/${rawToken}`;

      return { newId, shareUrl, expiresAt, permissions: resolvedPermissions };
    });

    if (!result) return res.status(404).json({ error: 'Link not found' });

    return res.json({
      ok: true,
      id: result.newId,
      shareUrl: result.shareUrl,
      expiresAt: result.expiresAt,
      permissions: result.permissions,
    });
  } catch (e) {
    console.error('POST /api/secure-share/:id/revoke-and-rotate error:', e);
    return res.status(500).json({ error: 'Failed to rotate link' });
  }
}
