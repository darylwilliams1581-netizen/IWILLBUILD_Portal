/**
 * PATCH /api/camera-captures/:id
 * Update note, jobId, or status on a capture.
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

    const body = req.body as { note?: string | null; jobId?: number | null; status?: string };

    if ('note' in body && !('jobId' in body) && !('status' in body)) {
      await db.execute(sql`
        UPDATE camera_captures SET note = ${body.note ?? null}
        WHERE id = ${captureId} AND company_id = ${profile.companyId} AND user_id = ${session.user.id}
      `);
    } else if ('jobId' in body) {
      const newStatus = body.jobId != null ? 'assigned' : 'captured';
      await db.execute(sql`
        UPDATE camera_captures SET job_id = ${body.jobId ?? null}, status = ${newStatus}
        WHERE id = ${captureId} AND company_id = ${profile.companyId} AND user_id = ${session.user.id}
      `);
    } else if ('status' in body && body.status) {
      await db.execute(sql`
        UPDATE camera_captures SET status = ${body.status}
        WHERE id = ${captureId} AND company_id = ${profile.companyId} AND user_id = ${session.user.id}
      `);
    } else {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    res.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('PATCH /api/camera-captures/:id error:', msg);
    res.status(500).json({ error: msg });
  }
}
