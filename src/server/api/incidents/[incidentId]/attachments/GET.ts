/**
 * GET /api/incidents/:incidentId/attachments
 * List all attachments for an incident.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

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

    const incidentId = parseInt(req.params.incidentId, 10);
    if (isNaN(incidentId)) return res.status(400).json({ error: 'Invalid ID' });

    const attachments = (await db.execute(sql.raw(
      `SELECT id, file_type, original_name, mime_type, size_bytes, public_url, created_at
       FROM incident_attachments
       WHERE incident_id = ${incidentId} AND company_id = ${profile.companyId}
       ORDER BY created_at ASC`
    )) as unknown as [Array<Record<string, unknown>>, unknown])[0];

    return res.json({ attachments: attachments ?? [] });
  } catch (e) {
    console.error('[incident-attachments GET]', e);
    return res.status(500).json({ error: 'Failed' });
  }
}
