/**
 * POST /api/risk-register/:id/share-token
 * Generate (or return the existing active) share token for a hazard entry.
 *
 * Security model:
 *   - Raw token is generated with 48 cryptographically random bytes (96 hex chars).
 *   - Only SHA-256(rawToken) is stored in the database (token_hash column).
 *   - The raw token is returned ONCE at creation time and never stored in plain text.
 *   - Public lookup hashes the supplied token and compares token_hash.
 *   - Creating a new link revokes any existing active token first.
 *
 * Returns: { token, url }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { randomBytes, createHash } from 'node:crypto';

function sha256hex(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
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

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const entryId = parseInt(String(req.params.id), 10);
    if (isNaN(entryId) || entryId <= 0) return res.status(400).json({ error: 'Invalid ID' });

    // Verify ownership
    const [ownerRows] = await db.execute(sql`
      SELECT id FROM risk_register WHERE id = ${entryId} AND company_id = ${profile.companyId} LIMIT 1
    `) as unknown as [Array<{ id: number }>];
    if (!ownerRows?.length) return res.status(404).json({ error: 'Hazard not found' });

    // Revoke any existing active tokens before issuing a new one
    await db.execute(sql`
      UPDATE hazard_share_tokens
      SET revoked = 1
      WHERE hazard_id = ${entryId} AND company_id = ${profile.companyId} AND revoked = 0
    `);

    // Generate new raw token — 48 random bytes = 96 hex chars
    const rawToken = randomBytes(48).toString('hex');
    const tokenHash = sha256hex(rawToken);

    await db.execute(sql`
      INSERT INTO hazard_share_tokens (hazard_id, company_id, token_hash, created_by_user_id)
      VALUES (${entryId}, ${profile.companyId}, ${tokenHash}, ${session.user.id})
    `);

    const origin = req.headers['x-forwarded-proto']
      ? `${req.headers['x-forwarded-proto']}://${req.headers['host']}`
      : 'https://iwillbuild.com';

    // rawToken is returned here and never stored in plain text
    return res.status(201).json({ token: rawToken, url: `${origin}/hazard/${rawToken}` });
  } catch (err) {
    console.error('[hazard share-token POST] error:', err);
    return res.status(500).json({ error: 'Failed to generate share link' });
  }
}
