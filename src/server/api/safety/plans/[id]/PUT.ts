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

    const id = parseInt(req.params.id, 10);
    const {
      title, projectValue, isPrincipalContractor, siteAddress,
      siteSupervisor, firstAidOfficer, emergencyContact, nearestHospital,
      emergencyAssemblyPoint, evacuationNotes, siteRules, highRiskActivities,
      requiredPosters, status,
      plan_data, plan_type,
      // snake_case aliases from WHS builder
      project_value, is_principal_contractor,
      site_address, site_supervisor, first_aid_officer, emergency_contact,
      nearest_hospital, emergency_assembly_point, evacuation_notes,
      high_risk_activities,
    } = req.body as Record<string, string>;

    const resolvedTitle = (title ?? '').trim();
    if (!resolvedTitle) return res.status(400).json({ error: 'Title is required' });

    const resolvedProjectValue = projectValue ?? project_value ?? null;
    const resolvedIsPC = isPrincipalContractor === 'true' || is_principal_contractor === '1' || (is_principal_contractor as unknown) === 1 ? 1 : 0;
    const resolvedSiteAddress = siteAddress ?? site_address ?? null;
    const resolvedSupervisor = siteSupervisor ?? site_supervisor ?? null;
    const resolvedFirstAid = firstAidOfficer ?? first_aid_officer ?? null;
    const resolvedEmergency = emergencyContact ?? emergency_contact ?? null;
    const resolvedHospital = nearestHospital ?? nearest_hospital ?? null;
    const resolvedAssembly = emergencyAssemblyPoint ?? emergency_assembly_point ?? null;
    const resolvedEvacuation = evacuationNotes ?? evacuation_notes ?? null;
    const resolvedHRA = highRiskActivities ?? high_risk_activities ?? null;

    await db.execute(sql`
      UPDATE safety_plans SET
        title = ${resolvedTitle},
        project_value = ${resolvedProjectValue},
        is_principal_contractor = ${resolvedIsPC},
        site_address = ${resolvedSiteAddress},
        site_supervisor = ${resolvedSupervisor},
        first_aid_officer = ${resolvedFirstAid},
        emergency_contact = ${resolvedEmergency},
        nearest_hospital = ${resolvedHospital},
        emergency_assembly_point = ${resolvedAssembly},
        evacuation_notes = ${resolvedEvacuation},
        site_rules = ${siteRules ?? null},
        high_risk_activities = ${resolvedHRA},
        required_posters = ${requiredPosters ?? null},
        status = ${status ?? 'draft'},
        plan_data = ${plan_data ?? null},
        plan_type = ${plan_type ?? null}
      WHERE id = ${id} AND company_id = ${profile.companyId}
    `);

    const [rows] = await db.execute(
      sql`SELECT sp.*, j.name as job_name, j.job_number FROM safety_plans sp
          LEFT JOIN jobs j ON j.id = sp.job_id
          WHERE sp.id = ${id} AND sp.company_id = ${profile.companyId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ plan: rows?.[0] ?? null });
  } catch (err) {
    console.error('PUT /api/safety/plans/:id error:', err);
    res.status(500).json({ error: 'Failed to update safety plan' });
  }
}
