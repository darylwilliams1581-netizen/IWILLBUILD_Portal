/**
 * POST /api/secure-share/:token/verify
 * Verify password/PIN for a password-protected share link.
 * Returns { ok: true } on success so the client can proceed.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { hashToken } from '../../../../lib/share-tokens.js';
import bcrypt from 'bcryptjs';

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params as { token: string };
    const { password } = req.body as { password: string };

    if (!token || token.length < 20) return res.status(400).json({ error: 'Invalid token' });
    if (!password) return res.status(400).json({ error: 'Password required' });

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
    }>];

    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    const link = rows[0];

    if (link.revoked) return res.status(410).json({ error: 'Link revoked' });
    if (link.expires_at && new Date(link.expires_at) < new Date()) return res.status(410).json({ error: 'Link expired' });
    if (link.max_uses !== null && link.use_count >= link.max_uses) return res.status(410).json({ error: 'Max uses reached' });

    if (!link.password_hash) return res.json({ ok: true }); // no password required

    const match = await bcrypt.compare(password, link.password_hash);
    if (!match) {
      await db.execute(sql`
        INSERT INTO secure_share_events
          (share_link_id, company_id, event_type, ip_address, user_agent)
        VALUES
          (${link.id}, ${link.company_id}, 'failed_password',
           ${req.ip ?? null}, ${req.headers['user-agent']?.slice(0, 500) ?? null})
      `);
      return res.status(401).json({ error: 'Incorrect password', code: 'WRONG_PASSWORD' });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/secure-share/:token/verify error:', err);
    return res.status(500).json({ error: 'Verification failed' });
  }
}
