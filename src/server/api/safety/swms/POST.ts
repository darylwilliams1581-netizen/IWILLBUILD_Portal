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
      authorName, approvedByName,
      swms_body, build_mode, document_type,
    } = b;

    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    const [result] = await db.execute(sql`
      INSERT INTO swms_templates
        (company_id, title, category, work_activity,
         purpose_scope, critical_risks, mandatory_controls, hazard_identification,
         high_risk_work, ppe_requirements, risk_rating, sequence_controls,
         hazards, risks, controls, ppe,
         plant_equipment, training_competency, emergency_controls,
         environmental_controls, sign_off_requirements,
         permits_approvals, monitoring_review, notes,
         revision_number, review_date, status, created_by_user_id,
         author_name, approved_by_name,
         swms_body, build_mode, document_type)
      VALUES
        (${profile.companyId}, ${title.trim()}, ${category ?? null}, ${workActivity ?? null},
         ${purposeScope ?? null}, ${criticalRisks ?? null}, ${mandatoryControls ?? null}, ${hazardIdentification ?? null},
         ${highRiskWork ?? null}, ${ppeRequirements ?? null}, ${riskRating ?? null}, ${sequenceControls ?? null},
         ${hazards ?? null}, ${risks ?? null}, ${controls ?? null}, ${ppe ?? null},
         ${plantEquipment ?? null}, ${trainingCompetency ?? null}, ${emergencyControls ?? null},
         ${environmentalControls ?? null}, ${signOffRequirements ?? null},
         ${permitsApprovals ?? null}, ${monitoringReview ?? null}, ${notes ?? null},
         ${revisionNumber ?? '1'}, ${reviewDate ?? null},
         ${status ?? 'draft'}, ${session.user.id},
         ${authorName ?? null}, ${approvedByName ?? null},
         ${swms_body ?? null}, ${build_mode ?? 'quick'}, ${document_type ?? 'swms'})
    `) as unknown as [ResultSetHeader, unknown];

    const [rows] = await db.execute(
      sql`SELECT * FROM swms_templates WHERE id = ${result.insertId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ swms: rows?.[0] ?? null });
  } catch (err) {
    console.error('POST /api/safety/swms error:', err);
    res.status(500).json({ error: 'Failed to create SWMS' });
  }
}
