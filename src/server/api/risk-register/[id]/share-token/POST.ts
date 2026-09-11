/**
 * POST /api/risk-register/:id/share-token
 * Generate (or return the existing active) share token for a hazard entry.
 * Token is a 48-byte cryptographically random hex string stored in plain text
 * (not hashed) — it is the URL secret itself, never transmitted in a header.
 * Returns: { token, url }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { randomBytes } from 'node:crypto';

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

    // Return existing active token if one exists
    const [existing] = await db.execute(sql`
      SELECT token FROM hazard_share_tokens
      WHERE hazard_id = ${entryId} AND company_id = ${profile.companyId} AND revoked = 0
      ORDER BY created_at DESC LIMIT 1
    `) as unknown as [Array<{ token: string }>];

    if (existing?.length) {
      const token = existing[0].token;
      const origin = (req.headers['x-forwarded-proto'] ? `${req.headers['x-forwarded-proto']}://${req.headers['host']}` : `https://iwillbuild.com`);
      return res.json({ token, url: `${origin}/hazard/${token}` });
    }

    // Generate new token — 48 random bytes = 96 hex chars
    const token = randomBytes(48).toString('hex');

    await db.execute(sql`
      INSERT INTO hazard_share_tokens (hazard_id, company_id, token, created_by_user_id)
      VALUES (${entryId}, ${profile.companyId}, ${token}, ${session.user.id})
    `);

    const origin = (req.headers['x-forwarded-proto'] ? `${req.headers['x-forwarded-proto']}://${req.headers['host']}` : `https://iwillbuild.com`);
    return res.status(201).json({ token, url: `${origin}/hazard/${token}` });
  } catch (err) {
    console.error('[hazard share-token POST] error:', err);
    return res.status(500).json({ error: 'Failed to generate share link' });
  }
}
