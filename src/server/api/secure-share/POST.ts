/**
 * POST /api/secure-share
 * ─────────────────────────────────────────────────────────────────────────────
 * Idempotent: returns the existing active link if one already exists for
 * (company_id, target_type, target_id).  Only creates a new row when no
 * active, non-expired, non-revoked link exists.
 *
 * Race safety: uses SELECT … FOR UPDATE inside a transaction so two
 * simultaneous requests for the same target still produce exactly one row.
 *
 * Returns the raw token ONCE — only the hash is stored in the DB.
 * The token is also stored AES-256-GCM encrypted so the authenticated owner
 * can recover the share URL without the raw token being in plaintext.
 *
 * Body:
 *   title         string
 *   linkType      string  (file_transfer | document_view | swms_signon | form_complete)
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
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
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

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    const companyId = profile?.companyId;
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

    // ── Transaction: check-then-insert with FOR UPDATE to prevent races ────────
    const result = await db.transaction(async (tx) => {
      if (!forceNew) {
        // Lock any existing active rows for this target so concurrent requests
        // wait rather than racing to insert a duplicate.
        const [existing] = await tx.execute(sql`
          SELECT id, token_encrypted, expires_at AS expiresAt, use_count AS useCount,
                 max_uses AS maxUses, permissions_json AS permissionsJson,
                 created_at AS createdAt
          FROM secure_share_links
          WHERE company_id = ${companyId}
            AND target_type = ${targetType}
            AND target_id   = ${String(targetId)}
            AND revoked     = 0
            AND (expires_at IS NULL OR expires_at > NOW())
            AND (max_uses IS NULL OR use_count < max_uses)
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE
        `) as unknown as [Array<Record<string, unknown>>, unknown];

        if (existing?.[0]) {
          const row = existing[0];
          // Decrypt the stored token to reconstruct the share URL
          const enc = row.token_encrypted as string | null;
          const rawToken = enc ? (await import('../../lib/share-tokens.js')).decryptToken(enc) : null;
          const shareUrl = rawToken ? `${APP_URL}/share/${rawToken}` : null;
          return {
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
          };
        }
      }

      // No active link — create one
      const rawToken = generateShareToken();
      const tokenHash = hashToken(rawToken);
      const tokenEncrypted = encryptToken(rawToken);

      // Hash password if provided
      let passwordHash: string | null = null;
      if (password && password.trim()) {
        const { default: bcrypt } = await import('bcryptjs');
        passwordHash = await bcrypt.hash(password.trim(), 10);
      }

      // Calculate expiry
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
      const resolvedLinkType = linkType ?? 'file_transfer';

      const [insertResult] = await tx.execute(sql`
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

      return {
        existing: false,
        id: insertId,
        shareUrl,
        expiresAt,
        useCount: 0,
        permissions,
        createdAt: new Date().toISOString(),
      };
    });

    return res.status(result.existing ? 200 : 201).json({
      ok: true,
      existing: result.existing,
      id: result.id,
      shareUrl: result.shareUrl,
      expiresAt: result.expiresAt,
      useCount: result.useCount,
      permissions: result.permissions,
      createdAt: result.createdAt,
    });
  } catch (e) {
    console.error('POST /api/secure-share error:', e);
    return res.status(500).json({ error: 'Failed to create share link' });
  }
}
