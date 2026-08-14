/**
 * POST /api/secure-share/:token
 * ─────────────────────────────────────────────────────────────────────────────
 * Public endpoint — no login required.
 * Handles password validation for password-protected share links.
 *
 * Body: { action: 'validate_password', password: string }
 *
 * On success returns:
 *   { ok: true, proof: '<raw-proof-token>' }
 *
 * The caller MUST pass ?proof=<token> when requesting content from
 * GET /api/secure-share/:token/content for password-protected links.
 * The proof is single-use, scoped to this share link, and expires in 15 minutes.
 * It is never stored in plain text — only a SHA-256 hash is persisted.
 *
 * Security properties:
 *   - Proof is bound to the specific share_link_id — cannot unlock a different token
 *   - Proof is single-use (used=1 after first content delivery)
 *   - Proof expires after 15 minutes regardless of use
 *   - Failed password attempts are audit-logged
 *   - Revoked / expired / max-uses links are rejected before password check
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { hashToken, generateShareToken } from '../../../lib/share-tokens.js';

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params as { token: string };
    if (!token || token.length < 20) {
      return res.status(400).json({ error: 'Invalid token', code: 'INVALID' });
    }

    const { action, password } = req.body as { action?: string; password?: string };

    if (action !== 'validate_password') {
      return res.status(400).json({ error: 'Unknown action' });
    }

    if (!password || !password.trim()) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const tokenHash = hashToken(token);

    const [rows] = await db.execute(sql`
      SELECT id, company_id, password_hash, revoked, expires_at, max_uses, use_count
      FROM secure_share_links
      WHERE token_hash = ${tokenHash}
      LIMIT 1
    `) as unknown as [Array<{
      id: number;
      company_id: number;
      password_hash: string | null;
      revoked: number;
      expires_at: string | null;
      max_uses: number | null;
      use_count: number;
    }>, unknown];

    const link = rows?.[0];
    if (!link) return res.status(404).json({ error: 'Link not found', code: 'NOT_FOUND' });
    if (link.revoked) return res.status(410).json({ error: 'This link has been revoked.', code: 'REVOKED' });
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This link has expired.', code: 'EXPIRED' });
    }
    if (link.max_uses !== null && link.use_count >= link.max_uses) {
      return res.status(410).json({ error: 'This link has reached its maximum uses.', code: 'MAX_USES' });
    }

    if (!link.password_hash) {
      // No password set — issue a proof anyway so the content endpoint flow is uniform
      const rawProof = generateShareToken();
      const proofHash = hashToken(rawProof);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
        .toISOString().slice(0, 19).replace('T', ' ');
      await db.execute(sql`
        INSERT INTO secure_share_access_proofs (share_link_id, proof_hash, expires_at, used)
        VALUES (${link.id}, ${proofHash}, ${expiresAt}, 0)
      `);
      return res.json({ ok: true, proof: rawProof });
    }

    const { default: bcrypt } = await import('bcryptjs');
    const valid = await bcrypt.compare(password.trim(), link.password_hash);
    if (!valid) {
      // Audit-log failed attempt
      try {
        await db.execute(sql`
          INSERT INTO secure_share_events
            (share_link_id, company_id, event_type, ip_address, user_agent, created_at)
          VALUES
            (${link.id}, ${link.company_id}, 'failed_password',
             ${req.ip ?? null}, ${(req.headers['user-agent'] ?? '').slice(0, 500)}, NOW())
        `);
      } catch { /* best-effort */ }
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    // Issue a short-lived, single-use access proof scoped to this share link
    const rawProof = generateShareToken();
    const proofHash = hashToken(rawProof);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
      .toISOString().slice(0, 19).replace('T', ' ');

    await db.execute(sql`
      INSERT INTO secure_share_access_proofs (share_link_id, proof_hash, expires_at, used)
      VALUES (${link.id}, ${proofHash}, ${expiresAt}, 0)
    `);

    // Audit-log successful unlock
    try {
      await db.execute(sql`
        INSERT INTO secure_share_events
          (share_link_id, company_id, event_type, ip_address, user_agent, created_at)
        VALUES
          (${link.id}, ${link.company_id}, 'password_unlocked',
           ${req.ip ?? null}, ${(req.headers['user-agent'] ?? '').slice(0, 500)}, NOW())
      `);
    } catch { /* best-effort */ }

    return res.json({ ok: true, proof: rawProof });
  } catch (e) {
    console.error('POST /api/secure-share/:token error:', e);
    return res.status(500).json({ error: 'Failed to validate password' });
  }
}
