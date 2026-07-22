import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
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

    const prestartId = parseInt(req.params.prestartId, 10);

    // Verify ownership
    const [existing] = await db.execute(sql`
      SELECT id, status FROM site_prestarts WHERE id = ${prestartId} AND company_id = ${profile.companyId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];
    if (!(existing ?? [])[0]) return res.status(404).json({ error: 'Not found' });
    if ((existing[0] as Record<string, unknown>).status === 'finalised') {
      return res.status(400).json({ error: 'Cannot edit a finalised prestart' });
    }

    const body = req.body as Record<string, unknown>;

    // Build update — only allow known fields
    const allowed = [
      'job_number','job_name','customer_name','site_address','prestart_date','start_time',
      'supervisor_name','first_aid_person','weather','rainfall_mm',
      'site_conditions','changed_conditions','weather_concerns','access_issues',
      'public_interface','live_services','underground_services','other_hazards','situation_checkboxes',
      'planned_work','work_location','plant_equipment','tools_required','deliveries_expected','key_tasks',
      'execution_checklist','critical_controls','task_sequencing','supervisor_instructions',
      'admin_checklist','hazards_actions','materials_delivered','plant_used',
      'emergency_number','electricity_emergency','radio_channel','assembly_point',
      'assembly_point_confirmed','stop_work_authority_confirmed',
      'relevant_swms_ids','swms_reviewed_confirmed','swms_review_notes','swms_snapshot',
      'no_swms_required','no_swms_reason',
      'weather_summary','ground_condition','weather_delay','delay_hours','delay_reason',
      'supervisor_signoff_name','supervisor_signature',
    ];

    const updates: string[] = [];
    const values: unknown[] = [];
    for (const key of allowed) {
      if (key in body) {
        const val = body[key];
        updates.push(`${key} = ?`);
        values.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
      }
    }

    if (updates.length === 0) return res.json({ ok: true });

    values.push(prestartId, profile.companyId);
    await db.execute(
      sql.raw(`UPDATE site_prestarts SET ${updates.join(', ')} WHERE id = ? AND company_id = ?`),
      values as never
    );

    const [updated] = await db.execute(sql`
      SELECT * FROM site_prestarts WHERE id = ${prestartId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ prestart: (updated ?? [])[0] });
  } catch (err) {
    console.error('PUT /api/jobs/:id/site-prestarts/:prestartId error:', err);
    res.status(500).json({ error: 'Failed to update site prestart' });
  }
}
