/**
 * PUT /api/safety/job-swms/:id
 * Updates a job-specific SWMS. Does NOT alter the source template.
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

    const id = Number(req.params.id);
    const b = req.body as Record<string, string>;

    const {
      title, category, workActivity,
      purposeScope, criticalRisks, mandatoryControls, hazardIdentification,
      highRiskWork, ppeRequirements, riskRating, sequenceControls,
      hazards, risks, controls, ppe,
      plantEquipment, trainingCompetency, emergencyControls,
      environmentalControls, signOffRequirements,
      permitsApprovals, monitoringReview, notes,
      revisionNumber, reviewDate, status,
    } = b;

    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    // Handle review/approval status transitions
    let reviewedBy: string | null = null;
    let reviewedAt: string | null = null;
    let approvedBy: string | null = null;
    let approvedAt: string | null = null;

    if (status === 'reviewed') {
      reviewedBy = session.user.id;
      reviewedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }
    if (status === 'approved') {
      approvedBy = session.user.id;
      approvedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    await db.execute(sql`
      UPDATE job_swms SET
        title = ${title.trim()},
        category = ${category ?? null},
        work_activity = ${workActivity ?? null},
        purpose_scope = ${purposeScope ?? null},
        critical_risks = ${criticalRisks ?? null},
        mandatory_controls = ${mandatoryControls ?? null},
        hazard_identification = ${hazardIdentification ?? null},
        high_risk_work = ${highRiskWork ?? null},
        ppe_requirements = ${ppeRequirements ?? null},
        risk_rating = ${riskRating ?? null},
        sequence_controls = ${sequenceControls ?? null},
        hazards = ${hazards ?? null},
        risks = ${risks ?? null},
        controls = ${controls ?? null},
        ppe = ${ppe ?? null},
        plant_equipment = ${plantEquipment ?? null},
        training_competency = ${trainingCompetency ?? null},
        emergency_controls = ${emergencyControls ?? null},
        environmental_controls = ${environmentalControls ?? null},
        sign_off_requirements = ${signOffRequirements ?? null},
        permits_approvals = ${permitsApprovals ?? null},
        monitoring_review = ${monitoringReview ?? null},
        notes = ${notes ?? null},
        revision_number = ${revisionNumber ?? '1'},
        review_date = ${reviewDate ?? null},
        status = ${status ?? 'draft'},
        reviewed_by_user_id = COALESCE(${reviewedBy}, reviewed_by_user_id),
        reviewed_at = COALESCE(${reviewedAt}, reviewed_at),
        approved_by_user_id = COALESCE(${approvedBy}, approved_by_user_id),
        approved_at = COALESCE(${approvedAt}, approved_at)
      WHERE id = ${id} AND company_id = ${profile.companyId}
    `);

    const [rows] = await db.execute(
      sql`SELECT * FROM job_swms WHERE id = ${id} AND company_id = ${profile.companyId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ jobSwms: rows?.[0] ?? null });
  } catch (err) {
    console.error('PUT /api/safety/job-swms/:id error:', err);
    res.status(500).json({ error: 'Failed to update job SWMS' });
  }
}
