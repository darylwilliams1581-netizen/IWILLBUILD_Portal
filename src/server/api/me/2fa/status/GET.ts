import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = await getSessionAndProfile(req, res);
    if (!auth) return;

    const rows = await db.execute(sql.raw(
      `SELECT two_factor_enabled FROM \`user\` WHERE id = '${auth.session.user.id}' LIMIT 1`
    )) as unknown as Array<{ two_factor_enabled: number }>;

    res.json({ enabled: !!rows[0]?.two_factor_enabled });
  } catch (err) {
    console.error('[2fa/status]', err);
    res.status(500).json({ error: 'Failed to fetch 2FA status' });
  }
}
