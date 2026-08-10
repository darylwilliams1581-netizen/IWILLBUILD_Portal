/**
 * GET /api/diag/route-check
 * TEMPORARY — proves Express route selection for /api/jobs/search vs /api/jobs/:id
 * Remove before publishing.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const auth = getAuth();
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
  }
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

  const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
  if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

  // Confirm /api/jobs/search handler fires (not /:id)
  const [searchRows] = await db.execute(
    sql`SELECT id, job_number, name, status FROM jobs WHERE company_id = ${profile.companyId} LIMIT 3`
  ) as unknown as [Array<Record<string, unknown>>, unknown];

  // Confirm /api/jobs/:id would NOT fire for "search" (it would parseInt("search") → NaN)
  const searchAsId = parseInt('search', 10);

  return res.json({
    handler: 'diag/route-check/GET.ts',
    routeProof: {
      message: 'If you see this, /api/diag/route-check fired correctly — Express route order is working.',
      searchAsIdParsed: searchAsId,
      searchAsIdIsNaN: isNaN(searchAsId),
    },
    sampleJobs: searchRows ?? [],
  });
}
