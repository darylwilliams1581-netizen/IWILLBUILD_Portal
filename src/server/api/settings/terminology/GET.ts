import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles, companies } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';

/** Industry → default labels */
function defaultLabels(industry: string | null): { singular: string; plural: string } {
  const i = (industry ?? '').toLowerCase();
  if (i.includes('fuel') || i.includes('dangerous') || i.includes('station')) return { singular: 'Site', plural: 'Sites' };
  if (i.includes('retail') || i.includes('store')) return { singular: 'Store', plural: 'Stores' };
  if (i.includes('general') || i.includes('project')) return { singular: 'Project', plural: 'Projects' };
  // Default: construction / everything else
  return { singular: 'Job', plural: 'Jobs' };
}

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

    const company = await db.query.companies.findFirst({ where: eq(companies.id, profile.companyId) });

    const [rows] = await db.execute(
      sql.raw(`SELECT work_label_singular, work_label_plural FROM company_settings WHERE company_id = ${Number(profile.companyId)} LIMIT 1`)
    ) as unknown as [Array<{ work_label_singular: string | null; work_label_plural: string | null }>, unknown];

    const row = rows?.[0];
    const defaults = defaultLabels(company?.industry ?? null);

    res.json({
      singular: row?.work_label_singular ?? defaults.singular,
      plural:   row?.work_label_plural   ?? defaults.plural,
    });
  } catch (error) {
    console.error('GET /api/settings/terminology error:', error);
    res.status(500).json({ error: 'Failed to load terminology' });
  }
}
