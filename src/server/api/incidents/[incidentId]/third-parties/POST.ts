import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
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

    const [check] = await db.execute(sql`
      SELECT id FROM incidents WHERE id = ${incidentId} AND company_id = ${profile.companyId}
    `) as unknown as [Array<{ id: number }>, unknown];
    if (!(check ?? [])[0]) return res.status(404).json({ error: 'Not found' });

    const {
      name, companyOrg, roleType, contactPhone, contactEmail,
      involvement, injuryDamageAlleged, statementTaken, isWitness,
    } = req.body as Record<string, unknown>;

    if (!name && !companyOrg) return res.status(400).json({ error: 'Name or company/organisation is required' });
    if (!involvement) return res.status(400).json({ error: 'Involvement description is required' });

    const [result] = await db.execute(sql`
      INSERT INTO incident_third_parties (
        incident_id, name, company_org, role_type,
        contact_phone, contact_email, involvement,
        injury_damage_alleged, statement_taken, is_witness
      ) VALUES (
        ${incidentId}, ${name ?? null}, ${companyOrg ?? null}, ${roleType ?? null},
        ${contactPhone ?? null}, ${contactEmail ?? null}, ${involvement},
        ${injuryDamageAlleged ? 1 : 0}, ${statementTaken ? 1 : 0}, ${isWitness ? 1 : 0}
      )
    `) as unknown as [{ insertId: number }, unknown];

    res.status(201).json({ id: (result as { insertId: number }).insertId });
  } catch (err) {
    console.error('POST third party error:', err);
    res.status(500).json({ error: 'Failed to add third party' });
  }
}
