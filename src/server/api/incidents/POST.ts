import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
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

    const {
      jobId,
      jobNumber,
      jobName,
      customerName,
      siteAddress,
      incidentDate,
      incidentTime,
      reportedBy,
      location,
      incidentType,
      severity,
      description,
      immediateActionTaken,
      injuryOccurred,
      personInjured,
      medicalTreatmentRequired,
      propertyDamage,
      environmentalImpact,
      witnesses,
      thirdPartiesInvolved,
      notes,
    } = req.body as Record<string, unknown>;

    if (!incidentDate) return res.status(400).json({ error: 'Incident date is required' });
    if (!reportedBy) return res.status(400).json({ error: 'Reported by is required' });
    if (!incidentType) return res.status(400).json({ error: 'Incident type is required' });
    if (!severity) return res.status(400).json({ error: 'Severity is required' });
    if (!description) return res.status(400).json({ error: 'Description is required' });

    const [result] = await db.execute(sql`
      INSERT INTO incidents (
        company_id, created_by_user_id,
        job_id, job_number, job_name, customer_name, site_address,
        incident_date, incident_time,
        reported_by, location,
        incident_type, severity,
        description, immediate_action_taken,
        injury_occurred, person_injured, medical_treatment_required,
        property_damage, environmental_impact,
        witnesses, third_parties_involved,
        notes, status
      ) VALUES (
        ${profile.companyId}, ${session.user.id},
        ${jobId ?? null}, ${jobNumber ?? null}, ${jobName ?? null}, ${customerName ?? null}, ${siteAddress ?? null},
        ${incidentDate}, ${incidentTime ?? null},
        ${reportedBy}, ${location ?? null},
        ${incidentType}, ${severity},
        ${description}, ${immediateActionTaken ?? null},
        ${injuryOccurred ? 1 : 0}, ${personInjured ?? null}, ${medicalTreatmentRequired ? 1 : 0},
        ${propertyDamage ? 1 : 0}, ${environmentalImpact ? 1 : 0},
        ${witnesses ?? null}, ${thirdPartiesInvolved ? 1 : 0},
        ${notes ?? null}, 'open'
      )
    `) as unknown as [{ insertId: number }, unknown];

    const insertId = (result as { insertId: number }).insertId;
    res.status(201).json({ id: insertId });
  } catch (err) {
    console.error('POST incident error:', err);
    res.status(500).json({ error: 'Failed to create incident' });
  }
}
