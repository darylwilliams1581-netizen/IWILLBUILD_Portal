import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

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

    const rows = await db.execute(
      sql`SELECT structure_json, dazza_json FROM company_settings WHERE company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as Array<{ structure_json: string; dazza_json: string }>;

    const row = Array.isArray(rows) ? rows[0] : null;

    const structure = row?.structure_json ? JSON.parse(row.structure_json) : {};
    const dazza = row?.dazza_json ? JSON.parse(row.dazza_json) : {};

    res.json({ structure, dazza });
  } catch (error) {
    console.error('GET /api/company-settings error:', error);
    res.status(500).json({ error: 'Failed to load settings' });
  }
}
