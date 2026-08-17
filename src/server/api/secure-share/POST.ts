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
 * Returns the raw token ONCE — only the hash is stored in the DB.
 * The token is also stored AES-256-GCM encrypted so the authenticated owner
 * can recover the share URL without the raw token being in plaintext.
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
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { resolveEffectiveCompany } from '../../lib/dazza-context.js';
import { generateShareToken, hashToken, encryptToken } from '../../lib/share-tokens.js';
import { APP_URL } from '../../lib/app-url.js';

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

    // ── Advisory lock: serialise check-and-insert per identity ───────────────
    // Lock name is scoped to company + target + link_type so different link
    // purposes for the same target do NOT block each other.
    // MySQL GET_LOCK() is connection-scoped and released on connection close.
    const lockName = `ssl:${companyId}:${targetType}:${String(targetId)}:${resolvedLinkType}`;
    // Truncate to MySQL's 64-char limit for GET_LOCK names
    const safeLockName = lockName.slice(0, 64);

    // Acquire lock (timeout 5 s — returns 1 on success, 0 on timeout, null on error)
    const lockResult = await db.execute(sql`SELECT GET_LOCK(${safeLockName}, 5) AS acquired`) as unknown as [Array<{ acquired: number | null }>, unknown];
    const lockAcquired = lockResult[0]?.[0]?.acquired === 1;

    if (!lockAcquired) {
      // Another request is holding the lock — return 429 so the client retries
      return res.status(429).json({ error: 'Concurrent request in progress, please retry' });
    }

    try {
      // ── Check for existing active link (same identity including link_type) ──
      if (!forceNew) {
        const [existing] = await db.execute(sql`
          SELECT id, token_encrypted, expires_at AS expiresAt, use_count AS useCount,
                 max_uses AS maxUses, permissions_json AS permissionsJson,
                 created_at AS createdAt
          FROM secure_share_links
          WHERE company_id = ${companyId}
            AND target_type = ${targetType}
            AND target_id   = ${String(targetId)}
            AND link_type   = ${resolvedLinkType}
            AND revoked     = 0
            AND (expires_at IS NULL OR expires_at > NOW())
            AND (max_uses IS NULL OR use_count < max_uses)
          ORDER BY created_at DESC
          LIMIT 1
        `) as unknown as [Array<Record<string, unknown>>, unknown];

        if (existing?.[0]) {
          const row = existing[0];
          const enc = row.token_encrypted as string | null;
          const rawToken = enc ? decryptToken(enc) : null;
          const shareUrl = rawToken ? `${APP_URL}/share/${rawToken}` : null;
          return res.status(200).json({
            ok: true,
            existing: true,
            id: row.id as number,
            shareUrl,
            expiresAt: row.expiresAt ? String(row.expiresAt) : null,
            useCount: Number(row.useCount ?? 0),
            permissions: (() => {
              try { return JSON.parse(row.permissionsJson as string) as string[]; }
              catch { return permissions; }
            })(),
            createdAt: row.createdAt ? String(row.createdAt) : null,
          });
        }
      }

      // ── No active link — create one ────────────────────────────────────────
      const rawToken = generateShareToken();
      const tokenHash = hashToken(rawToken);
      const tokenEncrypted = encryptToken(rawToken);

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

      const [insertResult] = await db.execute(sql`
        INSERT INTO secure_share_links
          (company_id, created_by_user_id, token_hash, token_encrypted,
           link_type, target_type, target_id,
           title, permissions_json, metadata_json, expires_at, password_hash, max_uses,
           use_count, revoked, created_at, updated_at)
        VALUES
          (${companyId}, ${session.user.id}, ${tokenHash}, ${tokenEncrypted},
           ${resolvedLinkType}, ${targetType}, ${String(targetId)},
           ${linkTitle}, ${permissionsJson}, ${metadataJson},
           ${expiresAt}, ${passwordHash}, ${maxUses ?? null},
           0, 0, NOW(), NOW())
      `) as unknown as [{ insertId: number }, unknown];

      const insertId = (insertResult as { insertId: number }).insertId;
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
      // Always release the advisory lock — even on error
      await db.execute(sql`SELECT RELEASE_LOCK(${safeLockName})`).catch(() => {/* ignore */});
    }
  } catch (e) {
    console.error('POST /api/secure-share error:', e);
    return res.status(500).json({ error: 'Failed to create share link' });
  }
}

// Local import to avoid circular — same module, just avoids re-importing inside transaction
import { decryptToken } from '../../lib/share-tokens.js';
