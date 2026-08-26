/**
 * PUT /api/rl-register/points/:id
 * Edit an RL point. Writes a history record before updating.
 * Submitted/signed-off points cannot be silently overwritten — they require
 * a correction note.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

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

    const pointId = parseInt(req.params['id'] as string, 10);
    if (isNaN(pointId)) return res.status(400).json({ error: 'Invalid point ID' });

    // Fetch existing point — enforce company isolation
    const [rows] = await db.execute(sql.raw(
      `SELECT * FROM rl_points WHERE id = ${pointId} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>];
    if (!rows?.length) return res.status(404).json({ error: 'RL point not found' });

    const existing = rows[0];

    // If the point is signed off, require a correction note
    const isSignedOff = Boolean(existing['signed_off_at']);
    const { correctionNote } = req.body as Record<string, unknown>;
    if (isSignedOff && !correctionNote) {
      return res.status(409).json({
        error: 'This reading has been signed off. Provide a correctionNote to record a correction.',
        requiresCorrectionNote: true,
      });
    }

    // Write history record before updating
    await db.execute(sql.raw(`
      INSERT INTO rl_point_history
        (point_id, company_id, snapshot_json, changed_by_user_id, correction_note)
      VALUES
        (${pointId}, ${profile.companyId},
         ${JSON.stringify(JSON.stringify(existing))},
         ${JSON.stringify(session.user.id)},
         ${correctionNote ? JSON.stringify(String(correctionNote)) : 'NULL'})
    `));

    const {
      pointName, location, measuredRl, targetRl, toleranceMm,
      riseFall, measurementDate, enteredBy, method, notes,
    } = req.body as Record<string, unknown>;

    const measuredNum = measuredRl !== undefined && measuredRl !== null && measuredRl !== ''
      ? parseFloat(String(measuredRl)) : null;
    if (measuredNum !== null && isNaN(measuredNum)) return res.status(400).json({ error: 'measuredRl must be a valid number' });

    const targetNum = targetRl !== undefined && targetRl !== null && targetRl !== ''
      ? parseFloat(String(targetRl)) : null;

    const tolNum = toleranceMm !== undefined && toleranceMm !== null && toleranceMm !== ''
      ? parseInt(String(toleranceMm), 10) : null;

    const rfNum = riseFall !== undefined && riseFall !== null && riseFall !== ''
      ? parseFloat(String(riseFall)) : null;

    const VALID_METHODS = ['laser_level', 'dumpy', 'total_station', 'gnss', 'other'];
    const methodVal = method && VALID_METHODS.includes(String(method)) ? String(method) : null;

    const setClauses: string[] = [];
    if (pointName !== undefined) setClauses.push(`point_name = ${JSON.stringify(String(pointName))}`);
    if (location !== undefined) setClauses.push(`location = ${location ? JSON.stringify(String(location)) : 'NULL'}`);
    if (measuredNum !== null) setClauses.push(`measured_rl = ${measuredNum}`);
    if (targetNum !== null) setClauses.push(`target_rl = ${targetNum}`);
    if (targetRl === null || targetRl === '') setClauses.push(`target_rl = NULL`);
    if (tolNum !== null) setClauses.push(`tolerance_mm = ${tolNum}`);
    if (toleranceMm === null || toleranceMm === '') setClauses.push(`tolerance_mm = NULL`);
    if (rfNum !== null) setClauses.push(`rise_fall = ${rfNum}`);
    if (riseFall === null || riseFall === '') setClauses.push(`rise_fall = NULL`);
    if (measurementDate !== undefined) setClauses.push(`measurement_date = ${measurementDate ? JSON.stringify(String(measurementDate)) : 'NULL'}`);
    if (enteredBy !== undefined) setClauses.push(`entered_by = ${enteredBy ? JSON.stringify(String(enteredBy)) : 'NULL'}`);
    if (methodVal !== null) setClauses.push(`method = ${JSON.stringify(methodVal)}`);
    if (notes !== undefined) setClauses.push(`notes = ${notes ? JSON.stringify(String(notes)) : 'NULL'}`);
    setClauses.push(`updated_at = NOW()`);

    if (setClauses.length > 1) {
      await db.execute(sql.raw(
        `UPDATE rl_points SET ${setClauses.join(', ')} WHERE id = ${pointId} AND company_id = ${profile.companyId}`
      ));
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/rl-register/points/:id error:', err);
    return res.status(500).json({ error: 'Failed to update RL point' });
  }
}
