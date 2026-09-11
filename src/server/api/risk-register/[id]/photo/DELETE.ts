import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';

import { db } from '../../../../db/client.js';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';
import { BUCKET_HAZARD_PHOTOS, deleteFile } from '../../../../storage/storage-service.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;
  const hazardId = Number(req.params.id);
  if (!Number.isInteger(hazardId) || hazardId <= 0) return res.status(400).json({ error: 'Invalid hazard ID' });

  const [rows] = await db.execute(sql`
    SELECT photo_path FROM risk_register
    WHERE id = ${hazardId} AND company_id = ${auth.profile.companyId}
    LIMIT 1
  `) as unknown as [Array<{ photo_path: string | null }>, unknown];
  const hazard = rows?.[0];
  if (!hazard) return res.status(404).json({ error: 'Hazard not found' });

  if (hazard.photo_path) await deleteFile(hazard.photo_path, BUCKET_HAZARD_PHOTOS);
  await db.execute(sql`
    UPDATE risk_register SET photo_path = NULL, updated_at = NOW()
    WHERE id = ${hazardId} AND company_id = ${auth.profile.companyId}
  `);
  return res.json({ ok: true });
}
