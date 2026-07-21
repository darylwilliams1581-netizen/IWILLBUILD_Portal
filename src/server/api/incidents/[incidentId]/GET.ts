import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';

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

    const [rows] = await db.execute(sql`
      SELECT i.*,
        (SELECT JSON_ARRAYAGG(JSON_OBJECT(
          'id', ca.id,
          'action', ca.action,
          'owner', ca.owner,
          'due_date', ca.due_date,
          'status', ca.status,
          'completed_at', ca.completed_at,
          'notes', ca.notes,
          'created_at', ca.created_at
        )) FROM incident_corrective_actions ca WHERE ca.incident_id = i.id ORDER BY ca.created_at ASC) AS corrective_actions,
        (SELECT JSON_ARRAYAGG(JSON_OBJECT(
          'id', tp.id,
          'name', tp.name,
          'company_org', tp.company_org,
          'role_type', tp.role_type,
          'contact_phone', tp.contact_phone,
          'contact_email', tp.contact_email,
          'involvement', tp.involvement,
          'injury_damage_alleged', tp.injury_damage_alleged,
          'statement_taken', tp.statement_taken,
          'is_witness', tp.is_witness
        )) FROM incident_third_parties tp WHERE tp.incident_id = i.id ORDER BY tp.created_at ASC) AS third_parties
      FROM incidents i
      WHERE i.id = ${incidentId} AND i.company_id = ${profile.companyId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    const record = (rows ?? [])[0];
    if (!record) return res.status(404).json({ error: 'Not found' });

    res.json(record);
  } catch (err) {
    console.error('GET incident error:', err);
    res.status(500).json({ error: 'Failed to fetch incident' });
  }
}
