/**
 * GET /api/risk-register/:id
 * Returns a single risk register entry by ID (company-scoped).
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';

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

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const [rows] = await db.execute(sql.raw(`
      SELECT r.*, j.job_number, j.name AS job_name, j.site_address
      FROM risk_register r
      LEFT JOIN jobs j ON j.id = r.job_id
      WHERE r.id = ${id} AND r.company_id = ${profile.companyId}
      LIMIT 1
    `)) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!rows?.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/risk-register/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch risk entry' });
  }
}
