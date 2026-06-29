import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const profile = (req as unknown as { userProfile?: { userId: string } }).userProfile;
    if (!profile) return res.status(401).json({ error: 'Unauthorized' });

    const [rows] = await db.execute(sql.raw(
      `SELECT two_factor_enabled FROM \`user\` WHERE id = '${profile.userId}' LIMIT 1`
    )) as [Array<{ two_factor_enabled: number }>, unknown];

    res.json({ enabled: !!rows[0]?.two_factor_enabled });
  } catch (err) {
    console.error('[2fa/status]', err);
    res.status(500).json({ error: 'Failed to fetch 2FA status' });
  }
}
