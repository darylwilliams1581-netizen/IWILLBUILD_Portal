/**
 * POST /api/safety/job-swms
 * Creates a new job-specific SWMS, optionally copying from a template.
 * Body: { jobId, templateIds?: number[], title?, ...fields }
 */
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

    const { jobId, templateIds, title } = req.body as {
      jobId: number;
      templateIds?: number[];
      title?: string;
    };

    if (!jobId) return res.status(400).json({ error: 'jobId is required' });

    // Verify job belongs to company
    const [jobRows] = await db.execute(
      sql`SELECT id, name, job_number FROM jobs WHERE id = ${jobId} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number; name: string; job_number: string | null }>, unknown];
    if (!jobRows?.length) return res.status(404).json({ error: 'Job not found' });

    const created: Array<Record<string, unknown>> = [];

    if (templateIds && templateIds.length > 0) {
      // Copy each selected template into a job-specific SWMS
      for (const tplId of templateIds) {
        const [tplRows] = await db.execute(
          sql`SELECT * FROM swms_templates WHERE id = ${tplId} AND company_id = ${profile.companyId} LIMIT 1`
        ) as unknown as [Array<Record<string, unknown>>, unknown];
        const tpl = tplRows?.[0];
        if (!tpl) continue;

        const docTitle = title?.trim() || String(tpl.title ?? 'SWMS');

        const [result] = await db.execute(sql`
          INSERT INTO job_swms
            (company_id, job_id, template_id, swms_template_id, title, category, work_activity,
             purpose_scope, critical_risks, mandatory_controls, hazard_identification,
             high_risk_work, ppe_requirements, risk_rating, sequence_controls,
             hazards, risks, controls, ppe, plant_equipment, training_competency,
             emergency_controls, environmental_controls, sign_off_requirements,
             permits_approvals, monitoring_review, notes,
             revision_number, review_date, status, assigned_by_user_id)
          VALUES
            (${profile.companyId}, ${jobId}, ${tplId}, ${tplId}, ${docTitle},
             ${tpl.category ?? null}, ${tpl.work_activity ?? null},
             ${tpl.purpose_scope ?? null}, ${tpl.critical_risks ?? null}, ${tpl.mandatory_controls ?? null},
             ${tpl.hazard_identification ?? null}, ${tpl.high_risk_work ?? null},
             ${tpl.ppe_requirements ?? null}, ${tpl.risk_rating ?? null}, ${tpl.sequence_controls ?? null},
             ${tpl.hazards ?? null}, ${tpl.risks ?? null}, ${tpl.controls ?? null},
             ${tpl.ppe ?? null}, ${tpl.plant_equipment ?? null}, ${tpl.training_competency ?? null},
             ${tpl.emergency_controls ?? null}, ${tpl.environmental_controls ?? null},
             ${tpl.sign_off_requirements ?? null}, ${tpl.permits_approvals ?? null},
             ${tpl.monitoring_review ?? null}, ${tpl.notes ?? null},
             ${tpl.revision_number ?? '1'}, ${tpl.review_date ?? null},
             'draft', ${session.user.id})
        `) as unknown as [ResultSetHeader, unknown];

        const [newRows] = await db.execute(
          sql`SELECT * FROM job_swms WHERE id = ${result.insertId}`
        ) as unknown as [Array<Record<string, unknown>>, unknown];
        if (newRows?.[0]) created.push(newRows[0]);
      }
    } else {
      // Blank SWMS
      const docTitle = title?.trim() || 'New SWMS';
      const [result] = await db.execute(sql`
        INSERT INTO job_swms (company_id, job_id, title, status, assigned_by_user_id)
        VALUES (${profile.companyId}, ${jobId}, ${docTitle}, 'draft', ${session.user.id})
      `) as unknown as [ResultSetHeader, unknown];

      const [newRows] = await db.execute(
        sql`SELECT * FROM job_swms WHERE id = ${result.insertId}`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
      if (newRows?.[0]) created.push(newRows[0]);
    }

    res.status(201).json({ jobSwms: created });
  } catch (err) {
    console.error('POST /api/safety/job-swms error:', err);
    res.status(500).json({ error: 'Failed to create job SWMS' });
  }
}
