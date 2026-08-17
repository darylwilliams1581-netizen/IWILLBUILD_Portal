/**
 * POST /api/secure-share
 * ─────────────────────────────────────────────────────────────────────────────
 * Idempotent: returns the existing active link if one already exists for
 * (company_id, target_type, target_id, link_type).  Only creates a new row
 * when no active, non-expired, non-revoked link exists for that exact identity.
 *
 * Different link_types for the same target coexist independently:
 *   document_view + live_form + job_sign_in for the same target_id are each
 *   their own idempotent link — they do NOT collide with each other.
 *
 * Concurrency safety: uses MySQL GET_LOCK() advisory lock scoped to the
 * exact identity key (company:target_type:target_id:link_type).
 * SELECT FOR UPDATE cannot prevent the insert-race on a missing row in MySQL
 * InnoDB (it only locks existing rows, not gaps in non-unique indexes).
 * GET_LOCK serialises the check-and-insert at the application level.
 *
 * ── Advisory lock correctness ─────────────────────────────────────────────
 * MySQL GET_LOCK() is connection-scoped.  All three operations —
 * GET_LOCK, the check/insert work, and RELEASE_LOCK — MUST execute on the
 * same physical connection.  This handler acquires a dedicated connection
 * from the pool, runs everything on it, and releases the connection in
 * finally.  Using db.execute() for the lock calls is incorrect because
 * the pool may route each call to a different connection.
 *
 * The lock name is a SHA-256 hex digest of the identity string, truncated
 * to 64 characters (MySQL's GET_LOCK name limit).  SHA-256 produces a
 * fixed-length 64-char hex string — no truncation of a variable-length
 * raw identity string that could cause collisions.
 *
 * Returns the raw token ONCE — only the hash is stored in the DB.
 * The token is also stored AES-256-GCM encrypted so the authenticated owner
 * can recover the share URL without the raw token being in plaintext.
 *
 * If SECURE_SHARE_TOKEN_ENCRYPTION_KEY is not configured:
 *   - Returns HTTP 503 with a generic configuration error to the owner.
 *   - Never exposes the secret name or any key material.
 *   - Existing recipient links continue to work (validated by token_hash).
 *
 * Body:
 *   title         string
 *   linkType      string  (file_transfer | document_view | swms_signon | form_complete | live_form | job_sign_in)
 *   targetType    string  (file | job_form | completed_form | swms | safety_plan | estimate | invoice | document)
 *   targetId      string  (record ID as string — never exposed in public URLs)
 *   permissions   string[]  (view | download | upload | sign | print)
 *   expiryDays?   number  (0 = no expiry)
 *   password?     string
 *   maxUses?      number
 *   metadata?     object
 *   forceNew?     boolean  (true = caller has already revoked; skip the active-link check)
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { resolveEffectiveCompany } from '../../lib/dazza-context.js';
import {
  generateShareToken,
  hashToken,
  encryptToken,
  decryptToken,
  EncryptionKeyMissingError,
} from '../../lib/share-tokens.js';
import { APP_URL } from '../../lib/app-url.js';
import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';

/**
 * Generate a fixed-length 64-char SHA-256 lock name from the identity tuple.
 * MySQL GET_LOCK() names are limited to 64 characters.  Using a SHA-256 hex
 * digest guarantees exactly 64 chars with no collisions from truncation.
 */
function makeLockName(companyId: number, targetType: string, targetId: string, linkType: string): string {
  return createHash('sha256')
    .update(`${companyId}:${targetType}:${targetId}:${linkType}`)
    .digest('hex'); // 64 hex chars — exactly MySQL's limit
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

    const {
      title,
      linkType,
      targetType,
      targetId,
      permissions = ['view'],
      expiryDays,
      password,
      maxUses,
      metadata,
      forceNew = false,
    } = req.body as {
      title?: string;
      linkType?: string;
      targetType?: string;
      targetId?: string;
      permissions?: string[];
      expiryDays?: number;
      password?: string;
      maxUses?: number;
      metadata?: Record<string, unknown>;
      forceNew?: boolean;
    };

    if (!targetType || !targetId) {
      return res.status(400).json({ error: 'targetType and targetId are required' });
    }
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return res.status(400).json({ error: 'At least one permission is required' });
    }

    const resolvedLinkType = (linkType ?? 'file_transfer').trim();

    // ── Advisory lock: acquire a dedicated connection ─────────────────────────
    // GET_LOCK, all DB work, and RELEASE_LOCK must run on the SAME connection.
    // db.$client is the underlying mysql2 Pool — getConnection() pins one conn.
    const lockName = makeLockName(companyId, targetType, String(targetId), resolvedLinkType);

    let conn: PoolConnection | null = null;
    try {
      conn = await (db.$client as import('mysql2/promise').Pool).getConnection();

      // Acquire lock (timeout 5 s — returns 1 on success, 0 on timeout, null on error)
      const [lockRows] = await conn.execute<import('mysql2').RowDataPacket[]>(
        'SELECT GET_LOCK(?, 5) AS acquired',
        [lockName],
      );
      const lockAcquired = (lockRows[0] as { acquired: number | null })?.acquired === 1;

      if (!lockAcquired) {
        return res.status(429).json({ error: 'Concurrent request in progress, please retry' });
      }

      try {
        // ── Check for existing active link (same identity including link_type) ──
        if (!forceNew) {
          const [existingRows] = await conn.execute<import('mysql2').RowDataPacket[]>(
            `SELECT id, token_encrypted, expires_at AS expiresAt, use_count AS useCount,
                    max_uses AS maxUses, permissions_json AS permissionsJson,
                    created_at AS createdAt
             FROM secure_share_links
             WHERE company_id = ?
               AND target_type = ?
               AND target_id   = ?
               AND link_type   = ?
               AND revoked     = 0
               AND (expires_at IS NULL OR expires_at > NOW())
               AND (max_uses IS NULL OR use_count < max_uses)
             ORDER BY created_at DESC
             LIMIT 1`,
            [companyId, targetType, String(targetId), resolvedLinkType],
          );

          const existing = (existingRows as import('mysql2').RowDataPacket[])[0];
          if (existing) {
            const enc = existing.token_encrypted as string | null;
            const rawToken = enc ? decryptToken(enc) : null;
            const shareUrl = rawToken ? `${APP_URL}/share/${rawToken}` : null;
            return res.status(200).json({
              ok: true,
              existing: true,
              id: existing.id as number,
              shareUrl,
              expiresAt: existing.expiresAt ? String(existing.expiresAt) : null,
              useCount: Number(existing.useCount ?? 0),
              permissions: (() => {
                try { return JSON.parse(existing.permissionsJson as string) as string[]; }
                catch { return permissions; }
              })(),
              createdAt: existing.createdAt ? String(existing.createdAt) : null,
            });
          }
        }

        // ── No active link — create one ────────────────────────────────────────
        // encryptToken() throws EncryptionKeyMissingError if the dedicated key
        // is not configured.  We catch it below and return 503.
        const rawToken = generateShareToken();
        const tokenHash = hashToken(rawToken);
        const tokenEncrypted = encryptToken(rawToken); // throws if key missing

        let passwordHash: string | null = null;
        if (password && password.trim()) {
          const { default: bcrypt } = await import('bcryptjs');
          passwordHash = await bcrypt.hash(password.trim(), 10);
        }

        let expiresAt: string | null = null;
        if (expiryDays && expiryDays > 0) {
          const d = new Date();
          d.setDate(d.getDate() + expiryDays);
          expiresAt = d.toISOString().slice(0, 19).replace('T', ' ');
        }

        const metadataJson = JSON.stringify({
          rail_type: 'secure_share_link',
          target_module: targetType,
          target_id: targetId,
          allowed_actions: permissions,
          security: {
            expires: !!expiresAt,
            password_required: !!passwordHash,
            audit_logged: true,
          },
          ...(metadata ?? {}),
        });

        const permissionsJson = JSON.stringify(permissions);
        const linkTitle = (title ?? '').trim() || `${targetType} share`;

        const [insertResult] = await conn.execute<import('mysql2').ResultSetHeader>(
          `INSERT INTO secure_share_links
             (company_id, created_by_user_id, token_hash, token_encrypted,
              link_type, target_type, target_id,
              title, permissions_json, metadata_json, expires_at, password_hash, max_uses,
              use_count, revoked, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NOW(), NOW())`,
          [
            companyId, session.user.id, tokenHash, tokenEncrypted,
            resolvedLinkType, targetType, String(targetId),
            linkTitle, permissionsJson, metadataJson,
            expiresAt, passwordHash, maxUses ?? null,
          ],
        );

        const insertId = (insertResult as import('mysql2').ResultSetHeader).insertId;
        const shareUrl = `${APP_URL}/share/${rawToken}`;

        return res.status(201).json({
          ok: true,
          existing: false,
          id: insertId,
          shareUrl,
          expiresAt,
          useCount: 0,
          permissions,
          createdAt: new Date().toISOString(),
        });
      } finally {
        // Always release the advisory lock on the same connection
        await conn.execute('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {/* ignore */});
      }
    } finally {
      // Always return the connection to the pool
      conn?.release();
    }
  } catch (e) {
    if (e instanceof EncryptionKeyMissingError) {
      // Return a generic configuration error — do NOT expose the secret name
      console.error('POST /api/secure-share: encryption key not configured');
      return res.status(503).json({
        error: 'Share link creation is temporarily unavailable. Please contact the site administrator.',
      });
    }
    console.error('POST /api/secure-share error:', e);
    return res.status(500).json({ error: 'Failed to create share link' });
  }
}
