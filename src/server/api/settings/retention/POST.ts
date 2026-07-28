/**
 * POST /api/settings/retention
 * Saves retention/archive settings for the company.
 * Admin/Owner only.
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
    if (!['owner', 'admin'].includes(profile.role ?? '')) {
      return res.status(403).json({ error: 'Owner or Admin access required' });
    }

    const { settings } = req.body as { settings: unknown };
    if (!settings) return res.status(400).json({ error: 'No settings provided' });

    const json = JSON.stringify(settings);
    await db.execute(sql`
      INSERT INTO company_settings (company_id, retention_json)
      VALUES (${profile.companyId}, ${json})
      ON DUPLICATE KEY UPDATE retention_json = ${json}
    `);

    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/settings/retention error:', e);
    res.status(500).json({ error: 'Failed to save retention settings' });
  }
}
