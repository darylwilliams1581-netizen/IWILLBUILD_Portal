import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles, jobs } from '../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';

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

    const jobId = parseInt(req.params.id, 10);

    // Verify job belongs to company
    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const { copyFromId } = req.body as { copyFromId?: number };

    let copyData: Record<string, unknown> = {};
    if (copyFromId) {
      const [copyRows] = await db.execute(sql`
        SELECT * FROM site_prestarts WHERE id = ${copyFromId} AND company_id = ${profile.companyId}
      `) as unknown as [Array<Record<string, unknown>>, unknown];
      const src = (copyRows ?? [])[0];
      if (src) {
        // Copy forward fields only — not signatures, dates, status, incidents
        copyData = {
          supervisor_name: src.supervisor_name,
          first_aid_person: src.first_aid_person,
          radio_channel: src.radio_channel,
          assembly_point: src.assembly_point,
          execution_checklist: src.execution_checklist,
          admin_checklist: src.admin_checklist,
          relevant_swms_ids: src.relevant_swms_ids,
          swms_snapshot: src.swms_snapshot,
          emergency_number: src.emergency_number,
          electricity_emergency: src.electricity_emergency,
        };
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const supervisorName = profile.displayName ?? session.user.name ?? '';

    const [result] = await db.execute(sql`
      INSERT INTO site_prestarts (
        company_id, job_id, created_by_user_id, status,
        job_number, job_name, customer_name, site_address,
        prestart_date, supervisor_name, first_aid_person,
        radio_channel, assembly_point,
        execution_checklist, admin_checklist,
        relevant_swms_ids, swms_snapshot,
        emergency_number, electricity_emergency,
        copied_from_id
      ) VALUES (
        ${profile.companyId}, ${jobId}, ${session.user.id}, 'draft',
        ${job.jobNumber ?? ''}, ${job.name}, ${job.client ?? ''},
        ${job.address ?? ''},
        ${today},
        ${(copyData.supervisor_name as string) ?? supervisorName},
        ${(copyData.first_aid_person as string) ?? ''},
        ${(copyData.radio_channel as string) ?? ''},
        ${(copyData.assembly_point as string) ?? ''},
        ${JSON.stringify((copyData.execution_checklist as unknown) ?? {})},
        ${JSON.stringify((copyData.admin_checklist as unknown) ?? {})},
        ${JSON.stringify((copyData.relevant_swms_ids as unknown) ?? [])},
        ${JSON.stringify((copyData.swms_snapshot as unknown) ?? [])},
        ${(copyData.emergency_number as string) ?? '000'},
        ${(copyData.electricity_emergency as string) ?? ''},
        ${copyFromId ?? null}
      )
    `) as unknown as [{ insertId: number }, unknown];

    const newId = (result as { insertId: number }).insertId;

    const [newRows] = await db.execute(sql`
      SELECT * FROM site_prestarts WHERE id = ${newId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ prestart: (newRows ?? [])[0] });
  } catch (err) {
    console.error('POST /api/jobs/:id/site-prestarts error:', err);
    res.status(500).json({ error: 'Failed to create site prestart' });
  }
}
