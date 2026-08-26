/**
 * POST /api/electrical-tests
 * Create a new electrical test record.
 * Any authenticated company member may create records.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { assessTestRecord } from '../../../lib/electrical-test-calc.js';
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

    const {
      jobId, templateId, templateName, assetId, circuitFeeder, phase, jointDescription,
      referenceTestPoint, drawingReference, workType, location, workOrderRef,
      measuredValue, unit, testCurrentVoltage, ambientTemp,
      minAccept, maxAccept, standardRef, documentNumber, documentVersion,
      testDate, testerName, equipmentId,
      notes, defectAction,
    } = req.body as Record<string, unknown>;

    if (!jobId) return res.status(400).json({ error: 'jobId required' });
    const jid = parseInt(String(jobId), 10);
    if (isNaN(jid)) return res.status(400).json({ error: 'Invalid jobId' });

    // Verify job belongs to company
    const [jobRows] = await db.execute(sql.raw(
      `SELECT id FROM jobs WHERE id = ${jid} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number }>];
    if (!jobRows?.length) return res.status(404).json({ error: 'Job not found' });

    // Auto-assess
    const mv = measuredValue !== null && measuredValue !== undefined && measuredValue !== ''
      ? parseFloat(String(measuredValue)) : null;
    const assessment = assessTestRecord(
      String(templateId ?? 'custom'),
      mv,
      minAccept !== null && minAccept !== undefined && minAccept !== '' ? parseFloat(String(minAccept)) : null,
      maxAccept !== null && maxAccept !== undefined && maxAccept !== '' ? parseFloat(String(maxAccept)) : null,
      standardRef ? String(standardRef) : null,
    );

    const testerDisplayName = testerName
      ? String(testerName)
      : (profile.firstName && profile.lastName ? `${profile.firstName} ${profile.lastName}` : session.user.email ?? '');

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const testDateVal = testDate ? String(testDate).slice(0, 19).replace('T', ' ') : now;

    const [insertResult] = await db.execute(sql.raw(`
      INSERT INTO electrical_test_records
        (company_id, job_id, template_id, template_name, asset_id, circuit_feeder, phase,
         joint_description, reference_test_point, drawing_reference, work_type, location, work_order_ref,
         measured_value, unit, test_current_voltage, ambient_temp,
         min_accept, max_accept, standard_ref, document_number, document_version,
         result, condition_class, standard_label,
         test_date, tester_name, tester_user_id, equipment_id,
         notes, defect_action, status, created_by_user_id, created_at, updated_at)
      VALUES (
        ${profile.companyId},
        ${jid},
        ${JSON.stringify(templateId ?? 'custom')},
        ${JSON.stringify(templateName ?? 'Custom Test')},
        ${assetId ? JSON.stringify(String(assetId)) : 'NULL'},
        ${circuitFeeder ? JSON.stringify(String(circuitFeeder)) : 'NULL'},
        ${phase ? JSON.stringify(String(phase)) : 'NULL'},
        ${jointDescription ? JSON.stringify(String(jointDescription)) : 'NULL'},
        ${referenceTestPoint ? JSON.stringify(String(referenceTestPoint)) : 'NULL'},
        ${drawingReference ? JSON.stringify(String(drawingReference)) : 'NULL'},
        ${workType ? JSON.stringify(String(workType)) : "'new_installation'"},
        ${location ? JSON.stringify(String(location)) : 'NULL'},
        ${workOrderRef ? JSON.stringify(String(workOrderRef)) : 'NULL'},
        ${mv !== null ? mv : 'NULL'},
        ${JSON.stringify(unit ?? '')},
        ${testCurrentVoltage ? JSON.stringify(String(testCurrentVoltage)) : 'NULL'},
        ${ambientTemp !== null && ambientTemp !== undefined && ambientTemp !== '' ? parseFloat(String(ambientTemp)) : 'NULL'},
        ${minAccept !== null && minAccept !== undefined && minAccept !== '' ? parseFloat(String(minAccept)) : 'NULL'},
        ${maxAccept !== null && maxAccept !== undefined && maxAccept !== '' ? parseFloat(String(maxAccept)) : 'NULL'},
        ${standardRef ? JSON.stringify(String(standardRef)) : 'NULL'},
        ${documentNumber ? JSON.stringify(String(documentNumber)) : 'NULL'},
        ${documentVersion ? JSON.stringify(String(documentVersion)) : 'NULL'},
        ${JSON.stringify(assessment.result)},
        ${assessment.condition ? JSON.stringify(assessment.condition) : 'NULL'},
        ${JSON.stringify(assessment.label)},
        ${JSON.stringify(testDateVal)},
        ${JSON.stringify(testerDisplayName)},
        ${JSON.stringify(session.user.id)},
        ${equipmentId ? parseInt(String(equipmentId), 10) : 'NULL'},
        ${notes ? JSON.stringify(String(notes)) : 'NULL'},
        ${defectAction ? JSON.stringify(String(defectAction)) : 'NULL'},
        'draft',
        ${JSON.stringify(session.user.id)},
        NOW(), NOW()
      )
    `)) as unknown as [ResultSetHeader];

    const newId = (insertResult as unknown as ResultSetHeader).insertId;

    // Audit
    await db.execute(sql.raw(`
      INSERT INTO electrical_test_audit
        (test_record_id, company_id, event_type, event_note, user_id, user_name, created_at)
      VALUES (${newId}, ${profile.companyId}, 'created', 'Record created', ${JSON.stringify(session.user.id)}, ${JSON.stringify(testerDisplayName)}, NOW())
    `));

    return res.status(201).json({ id: newId, result: assessment.result, condition: assessment.condition });
  } catch (err) {
    console.error('POST /api/electrical-tests error:', err);
    return res.status(500).json({ error: 'Failed to create test record' });
  }
}
