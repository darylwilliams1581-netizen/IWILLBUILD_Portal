/**
 * PUT /api/electrical-test-equipment/:id
 * Update equipment register entry. Admin/owner only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

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

    const id = parseInt(req.params['id'] as string, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const { owner, equipmentType, makeModel, serialNumber, calibrationDate, calibrationExpiry } =
      req.body as Record<string, string | undefined>;

    if (!makeModel?.trim()) return res.status(400).json({ error: 'Make/model is required' });

    await db.execute(sql.raw(`
      UPDATE electrical_test_equipment SET
        owner = ${owner?.trim() ? JSON.stringify(owner.trim()) : 'NULL'},
        equipment_type = ${equipmentType?.trim() ? JSON.stringify(equipmentType.trim()) : "'Other'"},
        make_model = ${JSON.stringify(makeModel.trim())},
        serial_number = ${serialNumber?.trim() ? JSON.stringify(serialNumber.trim()) : 'NULL'},
        calibration_date = ${calibrationDate?.trim() ? JSON.stringify(calibrationDate.trim()) : 'NULL'},
        calibration_expiry = ${calibrationExpiry?.trim() ? JSON.stringify(calibrationExpiry.trim()) : 'NULL'},
        updated_at = NOW()
      WHERE id = ${id} AND company_id = ${profile.companyId}
    `));

    return res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/electrical-test-equipment/:id error:', err);
    return res.status(500).json({ error: 'Failed to update equipment' });
  }
}
