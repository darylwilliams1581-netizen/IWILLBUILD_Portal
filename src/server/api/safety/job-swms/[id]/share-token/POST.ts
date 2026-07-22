/**
 * POST /api/safety/job-swms/:id/share-token
 * Generates (or returns existing) a public sign-off share token for a job SWMS.
 * Auth required. Returns { token, url }.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

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

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    // Verify SWMS belongs to company
    const [jsRows] = await db.execute(sql`
      SELECT id, title FROM job_swms WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1
    `) as unknown as [Array<{ id: number; title: string }>];
    if (!jsRows?.length) return res.status(404).json({ error: 'SWMS not found' });

    // Check for existing active token
    const [existing] = await db.execute(sql`
      SELECT token FROM swms_share_tokens
      WHERE job_swms_id = ${id} AND company_id = ${profile.companyId} AND revoked = 0
      ORDER BY created_at DESC LIMIT 1
    `) as unknown as [Array<{ token: string }>];

    let token: string;
    if (existing?.length) {
      token = existing[0].token;
    } else {
      token = crypto.randomBytes(32).toString('hex');
      await db.execute(sql`
        INSERT INTO swms_share_tokens (job_swms_id, company_id, token, created_by_user_id)
        VALUES (${id}, ${profile.companyId}, ${token}, ${session.user.id})
      `);
    }

    const origin = req.headers.origin ?? `https://${req.headers.host}`;
    res.json({ token, url: `${origin}/safety/sign/${token}` });
  } catch (err) {
    console.error('POST /api/safety/job-swms/:id/share-token error:', err);
    res.status(500).json({ error: 'Failed to generate share token' });
  }
}
