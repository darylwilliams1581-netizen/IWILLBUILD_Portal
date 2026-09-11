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

  const [rows] = await db.execute(sql`
    SELECT id, commenter_name, comment, action_taken, previous_status, new_status, created_at
    FROM hazard_public_comments
    WHERE hazard_id = ${hazardId} AND company_id = ${auth.profile.companyId}
    ORDER BY created_at DESC
  `) as unknown as [unknown[], unknown];
  return res.json({ comments: rows ?? [] });
}
