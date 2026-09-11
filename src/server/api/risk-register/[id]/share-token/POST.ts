import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';

import { db } from '../../../../db/client.js';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;
  const hazardId = Number(req.params.id);
  if (!Number.isInteger(hazardId) || hazardId <= 0) return res.status(400).json({ error: 'Invalid hazard ID' });

  const [hazards] = await db.execute(sql`
    SELECT id FROM risk_register WHERE id = ${hazardId} AND company_id = ${auth.profile.companyId} LIMIT 1
  `) as unknown as [unknown[], unknown];
  if (!hazards?.length) return res.status(404).json({ error: 'Hazard not found' });

  const rawToken = randomBytes(48).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  await db.execute(sql`
    UPDATE hazard_share_tokens SET revoked = 1
    WHERE hazard_id = ${hazardId} AND company_id = ${auth.profile.companyId} AND revoked = 0
  `);
  await db.execute(sql`
    INSERT INTO hazard_share_tokens
      (hazard_id, company_id, token_hash, created_by_user_id, revoked, created_at)
    VALUES
      (${hazardId}, ${auth.profile.companyId}, ${tokenHash}, ${auth.session.user.id}, 0, NOW())
  `);
  return res.status(201).json({ token: rawToken, path: `/hazard/${rawToken}` });
}
