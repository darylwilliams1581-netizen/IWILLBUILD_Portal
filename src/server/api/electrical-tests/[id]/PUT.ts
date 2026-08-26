/**
 * PUT /api/electrical-tests/:id
 * Update a test record. Writes an audit entry for every change.
 * Cannot edit a record that is Accepted — requires supervisor override.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { assessTestRecord } from '../../../../lib/electrical-test-calc.js';

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

    const id = parseInt(req.params['id'] as string, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const [rows] = await db.execute(sql.raw(
      `SELECT id, status, company_id FROM electrical_test_records WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number; status: string; company_id: number }>];
    if (!rows?.length) return res.status(404).json({ error: 'Record not found' });

    const existing = rows[0];
    if (existing.status === 'accepted') {
      return res.status(409).json({ error: 'Accepted records cannot be edited. Use supervisor override.' });
    }

    const {
      templateId, templateName, assetId, circuitFeeder, phase, jointDescription,
      referenceTestPoint, drawingReference, workType, location, workOrderRef,
      measuredValue, unit, testCurrentVoltage, ambientTemp,
      minAccept, maxAccept, standardRef, documentNumber, documentVersion,
      testDate, testerName, equipmentId, notes, defectAction, editNote,
    } = req.body as Record<string, unknown>;

    const mv = measuredValue !== null && measuredValue !== undefined && measuredValue !== ''
      ? parseFloat(String(measuredValue)) : null;
    const assessment = assessTestRecord(
      String(templateId ?? 'custom'),
      mv,
      minAccept !== null && minAccept !== undefined && minAccept !== '' ? parseFloat(String(minAccept)) : null,
      maxAccept !== null && maxAccept !== undefined && maxAccept !== '' ? parseFloat(String(maxAccept)) : null,
      standardRef ? String(standardRef) : null,
    );

    const testerDisplayName = testerName ? String(testerName) : null;
    const testDateVal = testDate ? String(testDate).slice(0, 19).replace('T', ' ') : null;

    await db.execute(sql.raw(`
      UPDATE electrical_test_records SET
        template_id = ${JSON.stringify(templateId ?? 'custom')},
        template_name = ${JSON.stringify(templateName ?? 'Custom Test')},
        asset_id = ${assetId ? JSON.stringify(String(assetId)) : 'NULL'},
        circuit_feeder = ${circuitFeeder ? JSON.stringify(String(circuitFeeder)) : 'NULL'},
        phase = ${phase ? JSON.stringify(String(phase)) : 'NULL'},
        joint_description = ${jointDescription ? JSON.stringify(String(jointDescription)) : 'NULL'},
        reference_test_point = ${referenceTestPoint ? JSON.stringify(String(referenceTestPoint)) : 'NULL'},
        drawing_reference = ${drawingReference ? JSON.stringify(String(drawingReference)) : 'NULL'},
        work_type = ${workType ? JSON.stringify(String(workType)) : 'NULL'},
        location = ${location ? JSON.stringify(String(location)) : 'NULL'},
        work_order_ref = ${workOrderRef ? JSON.stringify(String(workOrderRef)) : 'NULL'},
        measured_value = ${mv !== null ? mv : 'NULL'},
        unit = ${JSON.stringify(unit ?? '')},
        test_current_voltage = ${testCurrentVoltage ? JSON.stringify(String(testCurrentVoltage)) : 'NULL'},
        ambient_temp = ${ambientTemp !== null && ambientTemp !== undefined && ambientTemp !== '' ? parseFloat(String(ambientTemp)) : 'NULL'},
        min_accept = ${minAccept !== null && minAccept !== undefined && minAccept !== '' ? parseFloat(String(minAccept)) : 'NULL'},
        max_accept = ${maxAccept !== null && maxAccept !== undefined && maxAccept !== '' ? parseFloat(String(maxAccept)) : 'NULL'},
        standard_ref = ${standardRef ? JSON.stringify(String(standardRef)) : 'NULL'},
        document_number = ${documentNumber ? JSON.stringify(String(documentNumber)) : 'NULL'},
        document_version = ${documentVersion ? JSON.stringify(String(documentVersion)) : 'NULL'},
        result = ${JSON.stringify(assessment.result)},
        condition_class = ${assessment.condition ? JSON.stringify(assessment.condition) : 'NULL'},
        standard_label = ${JSON.stringify(assessment.label)},
        test_date = ${testDateVal ? JSON.stringify(testDateVal) : 'test_date'},
        tester_name = ${testerDisplayName ? JSON.stringify(testerDisplayName) : 'tester_name'},
        equipment_id = ${equipmentId ? parseInt(String(equipmentId), 10) : 'NULL'},
        notes = ${notes ? JSON.stringify(String(notes)) : 'NULL'},
        defect_action = ${defectAction ? JSON.stringify(String(defectAction)) : 'NULL'},
        updated_at = NOW()
      WHERE id = ${id} AND company_id = ${profile.companyId}
    `));

    const userName = profile.firstName && profile.lastName
      ? `${profile.firstName} ${profile.lastName}` : session.user.email ?? '';
    await db.execute(sql.raw(`
      INSERT INTO electrical_test_audit
        (test_record_id, company_id, event_type, event_note, user_id, user_name, created_at)
      VALUES (${id}, ${profile.companyId}, 'edited', ${JSON.stringify(editNote ? String(editNote) : 'Record updated')}, ${JSON.stringify(session.user.id)}, ${JSON.stringify(userName)}, NOW())
    `));

    return res.json({ ok: true, result: assessment.result, condition: assessment.condition });
  } catch (err) {
    console.error('PUT /api/electrical-tests/:id error:', err);
    return res.status(500).json({ error: 'Failed to update record' });
  }
}
