import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { session, profile } = sp;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const body = req.body as Record<string, string | number | null | undefined>;

  // All updatable text/date/number fields
  const TEXT_FIELDS = [
    'name','acronym','address','asset_type','status',
    'asset_number','make','model','serial_number',
    'purchase_or_hire','hire_company','condition_rating',
    'current_location','assigned_person_name','service_notes',
  ];
  const DATE_FIELDS = [
    'hire_start_date','hire_end_date',
    'last_inspection_date','next_inspection_due','calibration_due','certificate_expiry',
    'last_service_date','next_service_date','purchase_date',
  ];
  const NUM_FIELDS = ['service_interval_days','assigned_job_id','container_id'];
  const LONG_TEXT_FIELDS = ['notes'];

  try {
    const [check] = await db.execute(sql`SELECT id FROM am_assets WHERE id = ${id} AND company_id = ${profile.companyId}`) as unknown as [unknown[], unknown];
    if (!(check as unknown[]).length) return res.status(404).json({ error: 'Not found' });

    const sets: string[] = [];
    for (const f of TEXT_FIELDS) {
      if (body[f] !== undefined) {
        const v = body[f];
        sets.push(v ? `${f} = '${String(v).replace(/'/g, "''")}'` : `${f} = NULL`);
      }
    }
    for (const f of DATE_FIELDS) {
      if (body[f] !== undefined) {
        const v = body[f];
        sets.push(v ? `${f} = '${String(v).replace(/'/g, "''")}'` : `${f} = NULL`);
      }
    }
    for (const f of NUM_FIELDS) {
      if (body[f] !== undefined) {
        const v = body[f];
        sets.push(v !== null && v !== '' ? `${f} = ${parseInt(String(v), 10)}` : `${f} = NULL`);
      }
    }
    for (const f of LONG_TEXT_FIELDS) {
      if (body[f] !== undefined) {
        const v = body[f];
        sets.push(v ? `${f} = '${String(v).replace(/'/g, "''")}'` : `${f} = NULL`);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });

    await db.execute(sql.raw(`UPDATE am_assets SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ${id}`));
    await db.execute(sql`INSERT INTO am_audit_log (entity_type, entity_id, action, actor_id, details_json) VALUES ('asset', ${id}, 'updated', ${session.user.id}, ${JSON.stringify(req.body)})`);

    const [rows] = await db.execute(sql`SELECT * FROM am_assets WHERE id = ${id}`) as unknown as [unknown[], unknown];
    return res.json({ asset: (rows as Record<string, unknown>[])[0] });
  } catch (err) {
    console.error('PATCH /api/asset-manager/assets/:id error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
