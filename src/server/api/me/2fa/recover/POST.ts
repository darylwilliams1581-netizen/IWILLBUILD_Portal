/**
 * POST /api/me/2fa/recover
 * Body: { backupCode: string }
 *
 * Allows a user to bypass TOTP using a single-use backup code.
 * On success: marks the backup code as used (single-use), returns { ok: true }.
 * The client then completes the BetterAuth sign-in.
 *
 * Security:
 *   - Backup codes are stored as SHA-256 hashes — never plaintext
 *   - Each code is single-use (used_at is set on first use)
 *   - Rate-limited: 5/account/15min + 10/IP/15min
 *   - Never logs the backup code
 */
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { check2faRate } from '../../../../lib/signup-rate-limiter.js';
import {
  getChallengeTokenFromRequest,
  getChallenge,
  deleteChallenge,
  clearChallengeCookie,
} from '../../../../lib/pending-2fa.js';

function hashCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

export default async function handler(req: Request, res: Response) {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
               || req.socket.remoteAddress || 'unknown';

    const { backupCode } = req.body as { backupCode?: string };
    if (!backupCode?.trim()) {
      return res.status(400).json({ error: 'Backup code is required.' });
    }

    // ── Challenge mode ─────────────────────────────────────────────────────────
    const challengeToken = getChallengeTokenFromRequest(req);
    if (challengeToken) {
      const challenge = await getChallenge(challengeToken);
      if (!challenge) {
        clearChallengeCookie(res);
        return res.status(401).json({
          error: 'Challenge expired or invalid. Please sign in again.',
          code:  'CHALLENGE_EXPIRED',
        });
      }

      const userId = challenge.userId;

      if (!check2faRate(ip, userId)) {
        return res.status(429).json({ error: 'Too many attempts. Please wait before trying again.' });
      }

      const hashed = hashCode(backupCode);

      const rows = (await db.execute(
        sql`SELECT id, used_at FROM totp_backup_codes
            WHERE user_id = ${userId} AND code_hash = ${hashed}
            LIMIT 1`,
      )) as unknown as [Array<{ id: string; used_at: string | null }>, unknown];

      const row = rows[0]?.[0];
      if (!row) {
        return res.status(400).json({ error: 'Invalid backup code.' });
      }
      if (row.used_at) {
        return res.status(400).json({ error: 'This backup code has already been used.' });
      }

      // Mark as used
      await db.execute(
        sql`UPDATE totp_backup_codes SET used_at = ${new Date()} WHERE id = ${row.id}`,
      );

      // Delete the challenge
      await deleteChallenge(challenge.id);
      clearChallengeCookie(res);

      return res.json({ ok: true });
    }

    // ── In-session mode (re-confirmation) ─────────────────────────────────────
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const userId = session.user.id;

    if (!check2faRate(ip, userId)) {
      return res.status(429).json({ error: 'Too many attempts. Please wait before trying again.' });
    }

    const hashed = hashCode(backupCode);

    const rows = (await db.execute(
      sql`SELECT id, used_at FROM totp_backup_codes
          WHERE user_id = ${userId} AND code_hash = ${hashed}
          LIMIT 1`,
    )) as unknown as [Array<{ id: string; used_at: string | null }>, unknown];

    const row = rows[0]?.[0];
    if (!row) {
      return res.status(400).json({ error: 'Invalid backup code.' });
    }
    if (row.used_at) {
      return res.status(400).json({ error: 'This backup code has already been used.' });
    }

    await db.execute(
      sql`UPDATE totp_backup_codes SET used_at = ${new Date()} WHERE id = ${row.id}`,
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[2fa/recover] error (details redacted)');
    return res.status(500).json({ error: 'Recovery failed.' });
  }
}
