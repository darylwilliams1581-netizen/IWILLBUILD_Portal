/**
 * POST /api/secure-share/:token
 * ─────────────────────────────────────────────────────────────────────────────
 * Public endpoint — no login required.
 * Handles password validation for password-protected share links.
 *
 * Body: { action: 'validate_password', password: string }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { hashToken } from '../../../lib/share-tokens.js';
import bcrypt from 'bcryptjs';

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params as { token: string };
    if (!token || token.length < 20) {
      return res.status(400).json({ error: 'Invalid token' });
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
    if (!link) return res.status(404).json({ error: 'Link not found' });
    if (link.revoked) return res.status(410).json({ error: 'Link has been revoked' });
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Link has expired' });
    }
    if (link.max_uses !== null && link.use_count >= link.max_uses) {
      return res.status(410).json({ error: 'Link has reached its maximum uses' });
    }

    if (!link.password_hash) {
      return res.json({ ok: true }); // No password set — always valid
    }

    const valid = await bcrypt.compare(password.trim(), link.password_hash);
    if (!valid) {
      // Log failed attempt
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

    return res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/secure-share/:token error:', e);
    return res.status(500).json({ error: 'Failed to validate password' });
  }
}
