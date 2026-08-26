/**
 * GET /api/electrical-test-equipment
 * List test equipment for the company.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { isCalibrationExpired } from '../../../lib/electrical-test-calc.js';

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

    const [rows] = await db.execute(sql.raw(`
      SELECT id, owner, equipment_type, make_model, serial_number,
             calibration_date, calibration_expiry, archived_at, created_at
      FROM electrical_test_equipment
      WHERE company_id = ${profile.companyId} AND archived_at IS NULL
      ORDER BY equipment_type ASC, make_model ASC
    `)) as unknown as [Array<Record<string, unknown>>];

    const equipment = (rows ?? []).map(e => ({
      ...e,
      calibrationExpired: isCalibrationExpired(e['calibration_expiry'] as string | null),
    }));

    return res.json({ equipment });
  } catch (err) {
    console.error('GET /api/electrical-test-equipment error:', err);
    return res.status(500).json({ error: 'Failed to load equipment' });
  }
}
