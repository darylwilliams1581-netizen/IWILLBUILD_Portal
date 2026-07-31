/**
 * DELETE /api/camera-captures/:id
 * Soft-delete a capture (sets status = 'deleted').
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const captureId = parseInt(String(req.params.id), 10);
    if (isNaN(captureId)) return res.status(400).json({ error: 'Invalid ID' });

    await db.execute(sql`
      UPDATE camera_captures
      SET status = 'deleted'
      WHERE id = ${captureId}
        AND company_id = ${profile.companyId}
        AND user_id = ${session.user.id}
    `);

    res.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('DELETE /api/camera-captures/:id error:', msg);
    res.status(500).json({ error: msg });
  }
}
