/**
 * POST /api/safety/job-safety-plans
 * Copies a master safety plan template into a job, or creates a blank one.
 * Body: { jobId, templateId? }
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

    const { jobId, templateId } = req.body as { jobId: number; templateId?: number };
    if (!jobId) return res.status(400).json({ error: 'jobId required' });

    // Verify job belongs to company
    const [jobRows] = await db.execute(
      sql`SELECT id, name, site_address, client_name FROM jobs WHERE id = ${jobId} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number; name: string; site_address: string | null; client_name: string | null }>, unknown];
    if (!jobRows?.length) return res.status(404).json({ error: 'Job not found' });
    const job = jobRows[0];

    let insertId: number;

    if (templateId) {
      // Copy from master template (a safety_plan with job_id = NULL)
      const [tplRows] = await db.execute(
        sql`SELECT * FROM safety_plans WHERE id = ${templateId} AND company_id = ${profile.companyId} AND job_id IS NULL LIMIT 1`
      ) as unknown as [Array<Record<string, unknown>>, unknown];
      const tpl = tplRows?.[0];
      if (!tpl) return res.status(404).json({ error: 'Template not found' });

      const [result] = await db.execute(sql`
        INSERT INTO safety_plans
          (company_id, job_id, title, project_value, is_principal_contractor,
           site_address, site_supervisor, first_aid_officer, emergency_contact,
           nearest_hospital, emergency_assembly_point, evacuation_notes,
           site_rules, high_risk_activities, required_posters, status, created_by_user_id)
        VALUES
          (${profile.companyId}, ${jobId},
           ${String(tpl.title ?? 'Safety Plan')} ,
           ${tpl.project_value ?? null}, ${tpl.is_principal_contractor ?? 0},
           ${job.site_address ?? tpl.site_address ?? null},
           ${tpl.site_supervisor ?? null}, ${tpl.first_aid_officer ?? null},
           ${tpl.emergency_contact ?? null}, ${tpl.nearest_hospital ?? null},
           ${tpl.emergency_assembly_point ?? null}, ${tpl.evacuation_notes ?? null},
           ${tpl.site_rules ?? null}, ${tpl.high_risk_activities ?? null},
           ${tpl.required_posters ?? null}, 'draft', ${session.user.id})
      `) as unknown as [ResultSetHeader, unknown];
      insertId = result.insertId;
    } else {
      // Blank plan pre-filled with job details
      const [result] = await db.execute(sql`
        INSERT INTO safety_plans
          (company_id, job_id, title, site_address, status, created_by_user_id)
        VALUES
          (${profile.companyId}, ${jobId},
           ${`Safety Plan — ${job.name}`},
           ${job.site_address ?? null}, 'draft', ${session.user.id})
      `) as unknown as [ResultSetHeader, unknown];
      insertId = result.insertId;
    }

    const [newRows] = await db.execute(
      sql`SELECT * FROM safety_plans WHERE id = ${insertId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ plan: newRows?.[0] ?? null });
  } catch (err) {
    console.error('POST /api/safety/job-safety-plans error:', err);
    res.status(500).json({ error: 'Failed to create job safety plan' });
  }
}
