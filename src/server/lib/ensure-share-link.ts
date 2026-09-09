/**
 * ensure-share-link.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side helper: create or reuse a no-password secure_share_links row
 * for a given target.
 *
 * Used by the form email endpoint (and PDF builder) so that links in emails
 * and PDFs point to https://iwillbuild.com/share/{token} — which is publicly
 * accessible without login — rather than the login-walled portal URL.
 *
 * Rules:
 *   - password_hash = NULL (no password gate)
 *   - expires_at    = 90 days from now (matches existing share TTL)
 *   - If an active, non-expired, non-revoked row already exists for this
 *     (company_id, target_type, target_id) with password_hash IS NULL, reuse
 *     it by decrypting token_encrypted.  This avoids creating a new token on
 *     every email send.
 *   - If no reusable row exists, insert a fresh one.
 *   - Returns the raw token (64-char base64url) so the caller can build the URL.
 *   - Never throws — returns null on any failure so the caller can fall back
 *     gracefully (e.g. omit the link rather than crash the email send).
 *
 * The returned URL shape is always:
 *   https://iwillbuild.com/share/{rawToken}
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import {
  generateShareToken,
  hashToken,
  encryptToken,
  decryptToken,
} from './share-tokens.js';

const APP_URL = 'https://iwillbuild.com';
/** 90 days — matches the existing secure-share default */
const SHARE_TTL_DAYS = 90;

export type EnsureShareTargetType =
  | 'completed_form'
  | 'job_form'
  | 'job_photos';   // virtual type for the job photo gallery share

export interface EnsureShareLinkOptions {
  companyId: number;
  createdByUserId: string;
  targetType: EnsureShareTargetType;
  /** String ID of the target (submission ID or job ID) */
  targetId: string;
  title: string;
}

/**
 * Create or reuse a no-password secure share link.
 * Returns the full share URL, or null on failure.
 */
export async function ensureShareLink(opts: EnsureShareLinkOptions): Promise<string | null> {
  try {
    const { companyId, createdByUserId, targetType, targetId, title } = opts;

    // ── 1. Look for an existing active no-password row ────────────────────────
    const [existingRows] = await db.execute(sql`
      SELECT id, token_encrypted
      FROM secure_share_links
      WHERE company_id   = ${companyId}
        AND target_type  = ${targetType}
        AND target_id    = ${targetId}
        AND password_hash IS NULL
        AND revoked      = 0
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
      LIMIT 1
    `) as unknown as [Array<{ id: number; token_encrypted: string | null }>, unknown];

    const existing = existingRows?.[0];
    if (existing?.token_encrypted) {
      const raw = decryptToken(existing.token_encrypted);
      if (raw) {
        return `${APP_URL}/share/${raw}`;
      }
      // token_encrypted present but unreadable (key rotation) — fall through to create new
    }

    // ── 2. Create a new row ───────────────────────────────────────────────────
    const rawToken = generateShareToken();
    const tokenHash = hashToken(rawToken);
    const tokenEncrypted = encryptToken(rawToken); // throws EncryptionKeyMissingError if key absent

    const expiresDate = new Date();
    expiresDate.setDate(expiresDate.getDate() + SHARE_TTL_DAYS);
    const expiresAt = expiresDate.toISOString().slice(0, 19).replace('T', ' ');

    const permissions = JSON.stringify(['view', 'download']);
    const metadata = JSON.stringify({
      rail_type: 'secure_share_link',
      target_module: targetType,
      target_id: targetId,
      allowed_actions: ['view', 'download'],
      security: { expires: true, password_required: false, audit_logged: true },
      auto_created: true,
    });

    await db.execute(sql`
      INSERT INTO secure_share_links
        (company_id, created_by_user_id, token_hash, token_encrypted,
         link_type, target_type, target_id,
         title, permissions_json, metadata_json,
         expires_at, password_hash, max_uses,
         use_count, revoked, created_at, updated_at)
      VALUES
        (${companyId}, ${createdByUserId}, ${tokenHash}, ${tokenEncrypted},
         'document_view', ${targetType}, ${targetId},
         ${title}, ${permissions}, ${metadata},
         ${expiresAt}, NULL, NULL,
         0, 0, NOW(), NOW())
    `);

    return `${APP_URL}/share/${rawToken}`;
  } catch (err) {
    // Non-fatal — caller falls back gracefully
    console.warn('ensureShareLink: failed to create share link', err instanceof Error ? err.message : err);
    return null;
  }
}
