/**
 * PUT /api/safety/job-safety-plans/:id
 * Updates a job safety plan.
 */
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
      title, projectValue, isPrincipalContractor, siteAddress, siteSupervisor,
      firstAidOfficer, emergencyContact, nearestHospital, emergencyAssemblyPoint,
      evacuationNotes, siteRules, highRiskActivities, requiredPosters, status,
    } = req.body as Record<string, unknown>;

    await db.execute(sql`
      UPDATE safety_plans SET
        title = ${String(title ?? '')},
        project_value = ${projectValue ?? null},
        is_principal_contractor = ${isPrincipalContractor ? 1 : 0},
        site_address = ${siteAddress ?? null},
        site_supervisor = ${siteSupervisor ?? null},
        first_aid_officer = ${firstAidOfficer ?? null},
        emergency_contact = ${emergencyContact ?? null},
        nearest_hospital = ${nearestHospital ?? null},
        emergency_assembly_point = ${emergencyAssemblyPoint ?? null},
        evacuation_notes = ${evacuationNotes ?? null},
        site_rules = ${siteRules ?? null},
        high_risk_activities = ${highRiskActivities ?? null},
        required_posters = ${requiredPosters ?? null},
        status = ${status ?? 'draft'}
      WHERE id = ${id} AND company_id = ${profile.companyId}
    `);

    const [rows] = await db.execute(
      sql`SELECT * FROM safety_plans WHERE id = ${id}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ plan: rows?.[0] ?? null });
  } catch (err) {
    console.error('PUT /api/safety/job-safety-plans/:id error:', err);
    res.status(500).json({ error: 'Failed to update safety plan' });
  }
}
