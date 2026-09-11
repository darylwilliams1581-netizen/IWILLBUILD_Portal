/**
 * DELETE /api/risk-register/:id/photo
 * Remove the snapshot photo from a hazard register entry.
 *
 * Security:
 *   - Company ownership verified before any operation.
 *   - R2 object is deleted BEFORE photo_path is cleared.
 *   - If R2 deletion fails the DB is still cleared (avoids orphaned references).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { deleteFile } from '../../../../storage/storage-service.js';

const BUCKET = 'hazard-photos';

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

    const entryId = parseInt(String(req.params.id), 10);
    if (isNaN(entryId) || entryId <= 0) return res.status(400).json({ error: 'Invalid ID' });

    // Fetch current photo_path (company-scoped)
    const [rows] = await db.execute(sql`
      SELECT photo_path FROM risk_register
      WHERE id = ${entryId} AND company_id = ${profile.companyId} LIMIT 1
    `) as unknown as [Array<{ photo_path: string | null }>];

    if (!rows?.length) return res.status(404).json({ error: 'Hazard not found' });

    const photoPath = rows[0].photo_path;

    // Delete R2 object first (best-effort — don't leave abandoned objects)
    if (photoPath) {
      try {
        await deleteFile(photoPath, BUCKET);
      } catch (delErr) {
        console.warn('[hazard photo DELETE] R2 delete failed (clearing DB anyway):', delErr);
      }
    }

    // Clear photo_path regardless of R2 outcome
    await db.execute(sql`
      UPDATE risk_register
      SET photo_path = NULL, updated_at = NOW()
      WHERE id = ${entryId} AND company_id = ${profile.companyId}
    `);

    return res.json({ ok: true });
  } catch (err) {
    console.error('[hazard photo DELETE] error:', err);
    return res.status(500).json({ error: 'Failed to remove photo' });
  }
}
