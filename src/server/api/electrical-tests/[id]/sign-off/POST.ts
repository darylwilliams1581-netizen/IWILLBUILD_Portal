/**
 * POST /api/electrical-tests/:id/sign-off
 * Submit, accept, reject, or supervisor-override a test record.
 * Only admin/owner may accept, reject, or override.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

type SignOffAction = 'submit' | 'accept' | 'reject' | 'override';

const VALID_ACTIONS: SignOffAction[] = ['submit', 'accept', 'reject', 'override'];

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

    const { action, note, overrideJustification, checkedByName } = req.body as {
      action?: string;
      note?: string;
      overrideJustification?: string;
      checkedByName?: string;
    };

    if (!action || !VALID_ACTIONS.includes(action as SignOffAction)) {
      return res.status(400).json({ error: `action must be one of: ${VALID_ACTIONS.join(', ')}` });
    }

    const [rows] = await db.execute(sql.raw(
      `SELECT id, status, result, equipment_id FROM electrical_test_records WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number; status: string; result: string; equipment_id: number | null }>];
    if (!rows?.length) return res.status(404).json({ error: 'Record not found' });

    const existing = rows[0];
    const isAdmin = profile.role === 'owner' || profile.role === 'admin';
    const userName = profile.firstName && profile.lastName
      ? `${profile.firstName} ${profile.lastName}` : session.user.email ?? '';

    let newStatus = existing.status;
    let eventType = action;
    let setClause = '';

    if (action === 'submit') {
      if (existing.status !== 'draft' && existing.status !== 'review_required') {
        return res.status(409).json({ error: 'Only draft or review_required records can be submitted' });
      }
      newStatus = 'submitted';
      setClause = `status = 'submitted', submitted_at = NOW(), submitted_by_user_id = ${JSON.stringify(session.user.id)}, submitted_by_name = ${JSON.stringify(userName)}`;
    } else if (action === 'accept') {
      if (!isAdmin) return res.status(403).json({ error: 'Only admin/owner can accept records' });
      if (existing.status !== 'submitted') {
        return res.status(409).json({ error: 'Only submitted records can be accepted' });
      }
      // Check calibration expiry if equipment is linked
      if (existing.equipment_id) {
        const [eqRows] = await db.execute(sql.raw(
          `SELECT calibration_expiry FROM electrical_test_equipment WHERE id = ${existing.equipment_id} LIMIT 1`
        )) as unknown as [Array<{ calibration_expiry: string | null }>];
        const expiry = eqRows?.[0]?.calibration_expiry;
        if (expiry) {
          const [y, m, d] = expiry.split('-').map(Number);
          const expiryDate = new Date(y, m - 1, d);
          expiryDate.setHours(0, 0, 0, 0);
          const today = new Date(); today.setHours(0, 0, 0, 0);
          if (expiryDate < today && existing.result === 'PASS') {
            return res.status(409).json({
              error: 'Equipment calibration has expired. A supervisor override with justification is required to accept a Pass result.',
              code: 'calibration_expired',
            });
          }
        }
      }
      newStatus = 'accepted';
      const checkedName = checkedByName ?? userName;
      setClause = `status = 'accepted', checked_by_name = ${JSON.stringify(checkedName)}, checked_at = NOW(), accepted_by_name = ${JSON.stringify(userName)}, accepted_at = NOW()`;
    } else if (action === 'reject') {
      if (!isAdmin) return res.status(403).json({ error: 'Only admin/owner can reject records' });
      newStatus = 'review_required';
      setClause = `status = 'review_required', rejection_reason = ${note ? JSON.stringify(note) : 'NULL'}`;
    } else if (action === 'override') {
      if (!isAdmin) return res.status(403).json({ error: 'Only admin/owner can override records' });
      if (!overrideJustification?.trim()) {
        return res.status(400).json({ error: 'Supervisor override requires a justification' });
      }
      newStatus = 'accepted';
      setClause = `status = 'accepted', override_by_name = ${JSON.stringify(userName)}, override_at = NOW(), override_justification = ${JSON.stringify(overrideJustification)}, accepted_by_name = ${JSON.stringify(userName)}, accepted_at = NOW()`;
      eventType = 'supervisor_override';
    }

    await db.execute(sql.raw(
      `UPDATE electrical_test_records SET ${setClause}, updated_at = NOW() WHERE id = ${id} AND company_id = ${profile.companyId}`
    ));

    const auditNote = note ?? overrideJustification ?? `Status changed to ${newStatus}`;
    await db.execute(sql.raw(`
      INSERT INTO electrical_test_audit
        (test_record_id, company_id, event_type, event_note, user_id, user_name, created_at)
      VALUES (${id}, ${profile.companyId}, ${JSON.stringify(eventType)}, ${JSON.stringify(auditNote)}, ${JSON.stringify(session.user.id)}, ${JSON.stringify(userName)}, NOW())
    `));

    return res.json({ ok: true, status: newStatus });
  } catch (err) {
    console.error('POST /api/electrical-tests/:id/sign-off error:', err);
    return res.status(500).json({ error: 'Failed to update sign-off' });
  }
}
