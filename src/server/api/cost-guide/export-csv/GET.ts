/**
 * GET /api/cost-guide/export-csv
 * Downloads all cost guide items for the company as a CSV file.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { costGuideItems, profiles } from '../../../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { costGuideItemsToCsv } from '../../../lib/csv-utils.js';

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

    const items = await db
      .select()
      .from(costGuideItems)
      .where(eq(costGuideItems.companyId, profile.companyId))
      .orderBy(asc(costGuideItems.description));

    const csv = costGuideItemsToCsv(items);
    const filename = `cost-guide-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('GET /api/cost-guide/export-csv error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
}
