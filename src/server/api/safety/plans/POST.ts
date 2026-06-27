import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { ResultSetHeader } from 'mysql2';

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
      jobId, title, projectValue, isPrincipalContractor, siteAddress,
      siteSupervisor, firstAidOfficer, emergencyContact, nearestHospital,
      emergencyAssemblyPoint, evacuationNotes, siteRules, highRiskActivities,
      requiredPosters, status,
    } = req.body as Record<string, string>;

    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    const [result] = await db.execute(sql`
      INSERT INTO safety_plans
        (company_id, job_id, title, project_value, is_principal_contractor,
         site_address, site_supervisor, first_aid_officer, emergency_contact,
         nearest_hospital, emergency_assembly_point, evacuation_notes,
         site_rules, high_risk_activities, required_posters, status, created_by_user_id)
      VALUES
        (${profile.companyId}, ${jobId ? parseInt(jobId, 10) : null}, ${title.trim()},
         ${projectValue ?? null}, ${isPrincipalContractor === 'true' ? 1 : 0},
         ${siteAddress ?? null}, ${siteSupervisor ?? null}, ${firstAidOfficer ?? null},
         ${emergencyContact ?? null}, ${nearestHospital ?? null},
         ${emergencyAssemblyPoint ?? null}, ${evacuationNotes ?? null},
         ${siteRules ?? null}, ${highRiskActivities ?? null},
         ${requiredPosters ?? null}, ${status ?? 'draft'}, ${session.user.id})
    `) as unknown as [ResultSetHeader, unknown];

    const [rows] = await db.execute(
      sql`SELECT sp.*, j.name as job_name, j.job_number FROM safety_plans sp
          LEFT JOIN jobs j ON j.id = sp.job_id
          WHERE sp.id = ${result.insertId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ plan: rows?.[0] ?? null });
  } catch (err) {
    console.error('POST /api/safety/plans error:', err);
    res.status(500).json({ error: 'Failed to create safety plan' });
  }
}
