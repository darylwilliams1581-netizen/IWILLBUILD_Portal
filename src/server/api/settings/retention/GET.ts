/**
 * GET /api/settings/retention
 * Returns retention/archive settings for the company.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export const DEFAULT_RETENTION = {
  autoArchiveClosedJobsMonths: 0,   // 0 = disabled
  keepDeletedRecordsDays: 30,
  keepCompletedFormsForever: true,
  keepPhotosForever: true,
};

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

    const [rows] = await db.execute(
      sql`SELECT retention_json FROM company_settings WHERE company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ retention_json: string | null }>, unknown];

    const raw = rows?.[0]?.retention_json;
    const settings = raw ? { ...DEFAULT_RETENTION, ...JSON.parse(raw) } : DEFAULT_RETENTION;

    res.json({ settings });
  } catch (e) {
    console.error('GET /api/settings/retention error:', e);
    res.status(500).json({ error: 'Failed to load retention settings' });
  }
}
