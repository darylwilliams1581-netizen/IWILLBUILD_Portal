/**
 * GET /api/electrical-tests?jobId=N[&status=&result=&search=]
 * List electrical test records for a job (company-scoped).
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

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

    const { jobId, status, result, search } = req.query as Record<string, string | undefined>;
    if (!jobId) return res.status(400).json({ error: 'jobId required' });
    const jid = parseInt(jobId, 10);
    if (isNaN(jid)) return res.status(400).json({ error: 'Invalid jobId' });

    // Verify job belongs to company
    const [jobRows] = await db.execute(sql.raw(
      `SELECT id FROM jobs WHERE id = ${jid} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number }>];
    if (!jobRows?.length) return res.status(404).json({ error: 'Job not found' });

    let where = `r.job_id = ${jid} AND r.company_id = ${profile.companyId} AND r.archived_at IS NULL`;
    if (status) where += ` AND r.status = ${JSON.stringify(status)}`;
    if (result) where += ` AND r.result = ${JSON.stringify(result)}`;
    if (search) {
      const s = JSON.stringify(`%${search}%`);
      where += ` AND (r.asset_id LIKE ${s} OR r.template_name LIKE ${s} OR r.location LIKE ${s} OR r.tester_name LIKE ${s})`;
    }

    const [rows] = await db.execute(sql.raw(`
      SELECT
        r.id, r.job_id, r.template_id, r.template_name, r.asset_id, r.circuit_feeder,
        r.phase, r.joint_description, r.reference_test_point, r.drawing_reference,
        r.work_type, r.location, r.work_order_ref,
        r.measured_value, r.unit, r.result, r.condition_class,
        r.test_date, r.tester_name, r.tester_user_id,
        r.status, r.parent_test_id,
        r.checked_by_name, r.checked_at, r.accepted_by_name, r.accepted_at,
        r.notes, r.defect_action,
        r.equipment_id,
        e.make_model AS equipment_make_model,
        e.serial_number AS equipment_serial,
        e.calibration_expiry AS equipment_cal_expiry,
        (SELECT COUNT(*) FROM electrical_test_photos p WHERE p.test_record_id = r.id) AS photo_count,
        (SELECT COUNT(*) FROM electrical_test_records child WHERE child.parent_test_id = r.id AND child.archived_at IS NULL) AS retest_count
      FROM electrical_test_records r
      LEFT JOIN electrical_test_equipment e ON e.id = r.equipment_id
      WHERE ${where}
      ORDER BY r.test_date DESC, r.created_at DESC
    `)) as unknown as [Array<Record<string, unknown>>];

    return res.json({ records: rows ?? [] });
  } catch (err) {
    console.error('GET /api/electrical-tests error:', err);
    return res.status(500).json({ error: 'Failed to load test records' });
  }
}
