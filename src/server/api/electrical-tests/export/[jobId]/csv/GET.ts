/**
 * GET /api/electrical-tests/export/:jobId/csv
 * Export all test records for a job as CSV.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { formatAuDate } from '../../../../../../lib/electrical-test-calc.js';

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

    const jobId = parseInt(req.params['jobId'] as string, 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid jobId' });

    const [jobRows] = await db.execute(sql.raw(
      `SELECT id, name, job_number FROM jobs WHERE id = ${jobId} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number; name: string; job_number: string }>];
    if (!jobRows?.length) return res.status(404).json({ error: 'Job not found' });
    const job = jobRows[0];

    const [rows] = await db.execute(sql.raw(`
      SELECT r.asset_id, r.template_name, r.circuit_feeder, r.phase, r.joint_description,
             r.location, r.work_type, r.work_order_ref,
             r.measured_value, r.unit, r.result, r.condition_class, r.standard_label,
             r.standard_ref, r.document_number, r.document_version,
             r.test_current_voltage, r.ambient_temp,
             r.min_accept, r.max_accept,
             r.test_date, r.tester_name, r.status,
             r.notes, r.defect_action,
             r.checked_by_name, r.checked_at, r.accepted_by_name, r.accepted_at,
             e.make_model AS equipment_make_model, e.serial_number AS equipment_serial,
             e.calibration_expiry AS equipment_cal_expiry
      FROM electrical_test_records r
      LEFT JOIN electrical_test_equipment e ON e.id = r.equipment_id
      WHERE r.job_id = ${jobId} AND r.company_id = ${profile.companyId} AND r.archived_at IS NULL
      ORDER BY r.test_date ASC, r.created_at ASC
    `)) as unknown as [Array<Record<string, unknown>>];

    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const csvRows: string[] = [
      `Electrical Test Register — ${job.name ?? ''} (${job.job_number ?? ''})`,
      '',
      'Asset/Connection ID,Test Type,Circuit/Feeder,Phase,Joint Description,Location,Work Type,Work Order Ref,' +
      'Measured Value,Unit,Result,Condition,Assessment Label,Standard Ref,Doc Number,Doc Version,' +
      'Test Current/Voltage,Ambient Temp (°C),Min Accept,Max Accept,' +
      'Test Date,Tester,Status,Equipment Make/Model,Equipment Serial,Cal Expiry,' +
      'Checked By,Checked At,Accepted By,Accepted At,Notes,Defect/Corrective Action',
    ];

    for (const r of (rows ?? [])) {
      csvRows.push([
        esc(r['asset_id']),
        esc(r['template_name']),
        esc(r['circuit_feeder']),
        esc(r['phase']),
        esc(r['joint_description']),
        esc(r['location']),
        esc(r['work_type']),
        esc(r['work_order_ref']),
        esc(r['measured_value']),
        esc(r['unit']),
        esc(r['result']),
        esc(r['condition_class']),
        esc(r['standard_label']),
        esc(r['standard_ref']),
        esc(r['document_number']),
        esc(r['document_version']),
        esc(r['test_current_voltage']),
        esc(r['ambient_temp']),
        esc(r['min_accept']),
        esc(r['max_accept']),
        esc(r['test_date'] ? formatAuDate(String(r['test_date']).slice(0, 10)) : ''),
        esc(r['tester_name']),
        esc(r['status']),
        esc(r['equipment_make_model']),
        esc(r['equipment_serial']),
        esc(r['equipment_cal_expiry'] ? formatAuDate(String(r['equipment_cal_expiry'])) : ''),
        esc(r['checked_by_name']),
        esc(r['checked_at'] ? formatAuDate(String(r['checked_at']).slice(0, 10)) : ''),
        esc(r['accepted_by_name']),
        esc(r['accepted_at'] ? formatAuDate(String(r['accepted_at']).slice(0, 10)) : ''),
        esc(r['notes']),
        esc(r['defect_action']),
      ].join(','));
    }

    const csv = csvRows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="electrical-tests-job-${jobId}.csv"`);
    return res.send('\uFEFF' + csv);
  } catch (err) {
    console.error('GET /api/electrical-tests/export/:jobId/csv error:', err);
    return res.status(500).json({ error: 'Failed to export CSV' });
  }
}
