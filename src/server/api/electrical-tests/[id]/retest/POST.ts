/**
 * POST /api/electrical-tests/:id/retest
 * Create a linked retest record.
 * Copies asset/test identification from the original; preserves original result.
 * The original record is never modified.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
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

    const id = parseInt(req.params['id'] as string, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const [rows] = await db.execute(sql.raw(
      `SELECT * FROM electrical_test_records WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>];
    if (!rows?.length) return res.status(404).json({ error: 'Original record not found' });

    const orig = rows[0];
    const { correctiveWork, testerName } = req.body as { correctiveWork?: string; testerName?: string };

    const testerDisplayName = testerName
      ? testerName
      : (profile.firstName && profile.lastName ? `${profile.firstName} ${profile.lastName}` : session.user.email ?? '');

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Determine root parent (if original is itself a retest, link to its parent)
    const rootParentId = orig['parent_test_id'] ? orig['parent_test_id'] : id;

    const [insertResult] = await db.execute(sql.raw(`
      INSERT INTO electrical_test_records
        (company_id, job_id, parent_test_id, template_id, template_name,
         asset_id, circuit_feeder, phase, joint_description, reference_test_point,
         drawing_reference, work_type, location, work_order_ref,
         unit, min_accept, max_accept, standard_ref, document_number, document_version,
         test_current_voltage,
         result, condition_class, standard_label,
         test_date, tester_name, tester_user_id,
         corrective_work, status, created_by_user_id, created_at, updated_at)
      VALUES (
        ${profile.companyId},
        ${orig['job_id']},
        ${rootParentId},
        ${JSON.stringify(orig['template_id'] ?? 'custom')},
        ${JSON.stringify(orig['template_name'] ?? 'Custom Test')},
        ${orig['asset_id'] ? JSON.stringify(String(orig['asset_id'])) : 'NULL'},
        ${orig['circuit_feeder'] ? JSON.stringify(String(orig['circuit_feeder'])) : 'NULL'},
        ${orig['phase'] ? JSON.stringify(String(orig['phase'])) : 'NULL'},
        ${orig['joint_description'] ? JSON.stringify(String(orig['joint_description'])) : 'NULL'},
        ${orig['reference_test_point'] ? JSON.stringify(String(orig['reference_test_point'])) : 'NULL'},
        ${orig['drawing_reference'] ? JSON.stringify(String(orig['drawing_reference'])) : 'NULL'},
        ${orig['work_type'] ? JSON.stringify(String(orig['work_type'])) : "'retest'"},
        ${orig['location'] ? JSON.stringify(String(orig['location'])) : 'NULL'},
        ${orig['work_order_ref'] ? JSON.stringify(String(orig['work_order_ref'])) : 'NULL'},
        ${JSON.stringify(orig['unit'] ?? '')},
        ${orig['min_accept'] !== null && orig['min_accept'] !== undefined ? orig['min_accept'] : 'NULL'},
        ${orig['max_accept'] !== null && orig['max_accept'] !== undefined ? orig['max_accept'] : 'NULL'},
        ${orig['standard_ref'] ? JSON.stringify(String(orig['standard_ref'])) : 'NULL'},
        ${orig['document_number'] ? JSON.stringify(String(orig['document_number'])) : 'NULL'},
        ${orig['document_version'] ? JSON.stringify(String(orig['document_version'])) : 'NULL'},
        ${orig['test_current_voltage'] ? JSON.stringify(String(orig['test_current_voltage'])) : 'NULL'},
        'MANUAL', NULL, 'Pending retest',
        ${JSON.stringify(now)},
        ${JSON.stringify(testerDisplayName)},
        ${JSON.stringify(session.user.id)},
        ${correctiveWork ? JSON.stringify(correctiveWork) : 'NULL'},
        'draft',
        ${JSON.stringify(session.user.id)},
        NOW(), NOW()
      )
    `)) as unknown as [ResultSetHeader];

    const newId = (insertResult as unknown as ResultSetHeader).insertId;

    const userName = profile.firstName && profile.lastName
      ? `${profile.firstName} ${profile.lastName}` : session.user.email ?? '';

    // Audit on original
    await db.execute(sql.raw(`
      INSERT INTO electrical_test_audit
        (test_record_id, company_id, event_type, event_note, user_id, user_name, created_at)
      VALUES (${id}, ${profile.companyId}, 'retest_created', ${JSON.stringify(`Retest #${newId} created`)}, ${JSON.stringify(session.user.id)}, ${JSON.stringify(userName)}, NOW())
    `));
    // Audit on new retest
    await db.execute(sql.raw(`
      INSERT INTO electrical_test_audit
        (test_record_id, company_id, event_type, event_note, user_id, user_name, created_at)
      VALUES (${newId}, ${profile.companyId}, 'created', ${JSON.stringify(`Retest of record #${id}`)}, ${JSON.stringify(session.user.id)}, ${JSON.stringify(userName)}, NOW())
    `));

    return res.status(201).json({ id: newId });
  } catch (err) {
    console.error('POST /api/electrical-tests/:id/retest error:', err);
    return res.status(500).json({ error: 'Failed to create retest' });
  }
}
