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

    const [check] = await db.execute(sql`
      SELECT id FROM incidents WHERE id = ${incidentId} AND company_id = ${profile.companyId}
    `) as unknown as [Array<{ id: number }>, unknown];
    if (!(check ?? [])[0]) return res.status(404).json({ error: 'Not found' });

    const {
      jobId, jobNumber, jobName, customerName, siteAddress,
      incidentDate, incidentTime, reportedBy, location,
      incidentType, severity, description, immediateActionTaken,
      injuryOccurred, personInjured, medicalTreatmentRequired,
      propertyDamage, environmentalImpact, witnesses,
      thirdPartiesInvolved, notes, status,
    } = req.body as Record<string, unknown>;

    await db.execute(sql`
      UPDATE incidents SET
        job_id                    = ${jobId ?? null},
        job_number                = ${jobNumber ?? null},
        job_name                  = ${jobName ?? null},
        customer_name             = ${customerName ?? null},
        site_address              = ${siteAddress ?? null},
        incident_date             = ${incidentDate ?? null},
        incident_time             = ${incidentTime ?? null},
        reported_by               = ${reportedBy ?? null},
        location                  = ${location ?? null},
        incident_type             = ${incidentType ?? null},
        severity                  = ${severity ?? null},
        description               = ${description ?? null},
        immediate_action_taken    = ${immediateActionTaken ?? null},
        injury_occurred           = ${injuryOccurred ? 1 : 0},
        person_injured            = ${personInjured ?? null},
        medical_treatment_required = ${medicalTreatmentRequired ? 1 : 0},
        property_damage           = ${propertyDamage ? 1 : 0},
        environmental_impact      = ${environmentalImpact ? 1 : 0},
        witnesses                 = ${witnesses ?? null},
        third_parties_involved    = ${thirdPartiesInvolved ? 1 : 0},
        notes                     = ${notes ?? null},
        status                    = ${status ?? 'open'},
        updated_at                = NOW()
      WHERE id = ${incidentId} AND company_id = ${profile.companyId}
    `);

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT incident error:', err);
    res.status(500).json({ error: 'Failed to update incident' });
  }
}
