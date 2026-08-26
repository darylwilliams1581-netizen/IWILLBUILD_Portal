/**
 * POST /api/electrical-test-equipment
 * Create a new equipment register entry. Admin/owner only.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
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

    const isAdmin = profile.role === 'owner' || profile.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const { owner, equipmentType, makeModel, serialNumber, calibrationDate, calibrationExpiry } =
      req.body as Record<string, string | undefined>;

    if (!makeModel?.trim()) return res.status(400).json({ error: 'Make/model is required' });

    const [result] = await db.execute(sql.raw(`
      INSERT INTO electrical_test_equipment
        (company_id, owner, equipment_type, make_model, serial_number,
         calibration_date, calibration_expiry, created_by_user_id, created_at, updated_at)
      VALUES (
        ${profile.companyId},
        ${owner?.trim() ? JSON.stringify(owner.trim()) : 'NULL'},
        ${equipmentType?.trim() ? JSON.stringify(equipmentType.trim()) : "'Other'"},
        ${JSON.stringify(makeModel.trim())},
        ${serialNumber?.trim() ? JSON.stringify(serialNumber.trim()) : 'NULL'},
        ${calibrationDate?.trim() ? JSON.stringify(calibrationDate.trim()) : 'NULL'},
        ${calibrationExpiry?.trim() ? JSON.stringify(calibrationExpiry.trim()) : 'NULL'},
        ${JSON.stringify(session.user.id)},
        NOW(), NOW()
      )
    `)) as unknown as [ResultSetHeader];

    return res.status(201).json({ id: (result as unknown as ResultSetHeader).insertId });
  } catch (err) {
    console.error('POST /api/electrical-test-equipment error:', err);
    return res.status(500).json({ error: 'Failed to create equipment' });
  }
}
