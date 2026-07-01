/**
 * POST /api/secure-share
 * ─────────────────────────────────────────────────────────────────────────────
 * Create a new secure share link for any target (file, form, SWMS, etc.).
 * Returns the raw token ONCE — only the hash is stored in the DB.
 *
 * Body:
 *   title         string
 *   linkType      string  (file_transfer | document_view | swms_signon | form_complete)
 *   targetType    string  (file | job_form | swms | safety_plan | estimate | invoice | document)
 *   targetId      string  (record ID as string — never exposed in public URLs)
 *   permissions   string[]  (view | download | upload | sign | print)
 *   expiryDays?   number  (0 = no expiry)
 *   password?     string
 *   maxUses?      number
 *   metadata?     object
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { resolveEffectiveCompany } from '../../lib/dazza-context.js';
import { generateShareToken, hashToken } from '../../lib/share-tokens.js';

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
    };

    if (!targetType || !targetId) {
      return res.status(400).json({ error: 'targetType and targetId are required' });
    }
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return res.status(400).json({ error: 'At least one permission is required' });
    }

    // Generate raw token — only hash stored in DB
    const rawToken = generateShareToken();
    const tokenHash = hashToken(rawToken);

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

    // Build metadata_json with D-RAIL structure
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

    const [result] = await db.execute(sql`
      INSERT INTO secure_share_links
        (company_id, created_by_user_id, token_hash, link_type, target_type, target_id,
         title, permissions_json, metadata_json, expires_at, password_hash, max_uses,
         use_count, revoked, created_at, updated_at)
      VALUES
        (${companyId}, ${session.user.id}, ${tokenHash}, ${resolvedLinkType},
         ${targetType}, ${String(targetId)}, ${linkTitle},
         ${permissionsJson}, ${metadataJson},
         ${expiresAt}, ${passwordHash}, ${maxUses ?? null},
         0, 0, NOW(), NOW())
    `) as unknown as [{ insertId: number }, unknown];

    const insertId = (result as { insertId: number }).insertId;

    const shareUrl = `https://iwillbuild.com/share/${rawToken}`;

    return res.status(201).json({
      ok: true,
      id: insertId,
      token: rawToken,
      shareUrl,
      expiresAt,
    });
  } catch (e) {
    console.error('POST /api/secure-share error:', e);
    return res.status(500).json({ error: 'Failed to create share link' });
  }
}
