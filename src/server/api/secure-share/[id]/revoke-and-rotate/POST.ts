/**
 * POST /api/secure-share/:id/revoke-and-rotate
 * ─────────────────────────────────────────────────────────────────────────────
 * Atomically revokes the specified link and creates a new one for the same
 * target with the same (or caller-supplied) settings.
 *
 * Also revokes any other active duplicate links for the same
 * (company_id, target_type, target_id, link_type) identity — so the result
 * is always exactly one active link for that purpose.
 *
 * Links with a DIFFERENT link_type for the same target are NOT touched.
 *
 * Body (all optional — defaults to the revoked link's settings):
 *   permissions?  string[]
 *   expiryDays?   number  (0 = no expiry)
 *   password?     string
 *   maxUses?      number
 *
 * Returns the new share URL.
 * Authentication: session required; company-scoped.
 *
 * ── Advisory lock correctness ─────────────────────────────────────────────
 * GET_LOCK, all DB work, and RELEASE_LOCK run on the SAME pinned connection.
 * Lock name is SHA-256(company_id:target_type:target_id:link_type) — 64 hex
 * chars, matching MySQL's GET_LOCK name limit exactly, with no collision risk
 * from truncating a variable-length raw string.
 *
 * ── Encryption key ────────────────────────────────────────────────────────
 * If SECURE_SHARE_TOKEN_ENCRYPTION_KEY is not configured, returns HTTP 503
 * with a generic configuration error.  Never exposes the secret name.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { resolveEffectiveCompany } from '../../../../lib/dazza-context.js';
import {
  generateShareToken,
  hashToken,
  encryptToken,
  EncryptionKeyMissingError,
} from '../../../../lib/share-tokens.js';
import { APP_URL } from '../../../../lib/app-url.js';
import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';

function makeLockName(companyId: number, targetType: string, targetId: string, linkType: string): string {
  return createHash('sha256')
    .update(`${companyId}:${targetType}:${targetId}:${linkType}`)
    .digest('hex'); // 64 hex chars — exactly MySQL's GET_LOCK name limit
}

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

    // ── Fetch the target link (outside the lock — read-only, no race risk) ───
    // We need the identity tuple to build the lock name before acquiring it.
    const [fetchRows] = await (db.$client as import('mysql2/promise').Pool).execute<import('mysql2').RowDataPacket[]>(
      `SELECT id, target_type AS targetType, target_id AS targetId,
              title, link_type AS linkType, permissions_json AS permissionsJson,
              expires_at AS expiresAt, max_uses AS maxUses
       FROM secure_share_links
       WHERE id = ? AND company_id = ?
       LIMIT 1`,
      [id, companyId],
    );

    if (!(fetchRows as import('mysql2').RowDataPacket[])[0]) {
      return res.status(404).json({ error: 'Link not found' });
    }
    const old = (fetchRows as import('mysql2').RowDataPacket[])[0];

    const targetType = old.targetType as string;
    const targetId   = old.targetId as string;
    const linkType   = old.linkType as string;

    // ── Advisory lock: acquire a dedicated connection ─────────────────────────
    const lockName = makeLockName(companyId, targetType, targetId, linkType);

    let conn: PoolConnection | null = null;
    try {
      conn = await (db.$client as import('mysql2/promise').Pool).getConnection();

      const [lockRows] = await conn.execute<import('mysql2').RowDataPacket[]>(
        'SELECT GET_LOCK(?, 5) AS acquired',
        [lockName],
      );
      if ((lockRows[0] as { acquired: number | null })?.acquired !== 1) {
        return res.status(429).json({ error: 'Concurrent request in progress, please retry' });
      }

      try {
        // Revoke the specified link
        await conn.execute(
          'UPDATE secure_share_links SET revoked = 1, updated_at = NOW() WHERE id = ? AND company_id = ?',
          [id, companyId],
        );

        // Log revocation
        await conn.execute(
          `INSERT INTO secure_share_events
             (share_link_id, company_id, event_type, ip_address, user_agent, created_at)
           VALUES (?, ?, 'revoked', ?, ?, NOW())`,
          [id, companyId, req.ip ?? null, (req.headers['user-agent'] ?? '').slice(0, 500)],
        ).catch(() => {/* non-fatal */});

        // Revoke other active duplicates for the SAME identity (same link_type)
        await conn.execute(
          `UPDATE secure_share_links
           SET revoked = 1, updated_at = NOW()
           WHERE company_id = ? AND target_type = ? AND target_id = ?
             AND link_type = ? AND revoked = 0 AND id != ?`,
          [companyId, targetType, targetId, linkType, id],
        );

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
          expiresAt = String(old.expiresAt);
        }

        // encryptToken() throws EncryptionKeyMissingError if key not configured
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

        const [insertResult] = await conn.execute<import('mysql2').ResultSetHeader>(
          `INSERT INTO secure_share_links
             (company_id, created_by_user_id, token_hash, token_encrypted,
              link_type, target_type, target_id,
              title, permissions_json, metadata_json, expires_at, password_hash, max_uses,
              use_count, revoked, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NOW(), NOW())`,
          [
            companyId, session.user.id, tokenHash, tokenEncrypted,
            linkType, targetType, targetId,
            old.title as string, permissionsJson, metadataJson,
            expiresAt, passwordHash, maxUses ?? null,
          ],
        );

        const newId = (insertResult as import('mysql2').ResultSetHeader).insertId;
        const shareUrl = `${APP_URL}/share/${rawToken}`;

        return res.json({
          ok: true,
          id: newId,
          shareUrl,
          expiresAt,
          permissions: resolvedPermissions,
        });
      } finally {
        await conn.execute('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {/* ignore */});
      }
    } finally {
      conn?.release();
    }
  } catch (e) {
    if (e instanceof EncryptionKeyMissingError) {
      console.error('POST /api/secure-share/:id/revoke-and-rotate: encryption key not configured');
      return res.status(503).json({
        error: 'Share link creation is temporarily unavailable. Please contact the site administrator.',
      });
    }
    console.error('POST /api/secure-share/:id/revoke-and-rotate error:', e);
    return res.status(500).json({ error: 'Failed to rotate link' });
  }
}
