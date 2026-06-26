/**
 * GET /api/dashboard/setup-check
 * Returns { isSetup: boolean } — true if the company has any real data beyond
 * a brand-new empty account (jobs, fleet assets, extra team members, form
 * templates, or company files).
 *
 * Used by the dashboard welcome banner to decide between
 * "Getting Started" and "Welcome back" modes.
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

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.json({ isSetup: false });

    const companyId = profile.companyId;

    // Run all counts in parallel — stop as soon as we find any real data
    const [jobRows, fleetRows, teamRows, formRows, fileRows] = await Promise.all([
      db.execute(sql`SELECT 1 FROM jobs WHERE company_id = ${companyId} LIMIT 1`) as unknown as unknown[],
      db.execute(sql`SELECT 1 FROM fleet_assets WHERE company_id = ${companyId} LIMIT 1`) as unknown as unknown[],
      db.execute(sql`SELECT 1 FROM profiles WHERE company_id = ${companyId} AND status != 'inactive' LIMIT 2`) as unknown as unknown[],
      db.execute(sql`SELECT 1 FROM form_templates WHERE company_id = ${companyId} LIMIT 1`) as unknown as unknown[],
      db.execute(sql`SELECT 1 FROM company_files WHERE company_id = ${companyId} LIMIT 1`) as unknown as unknown[],
    ]);

    // isSetup = any jobs, any fleet, more than 1 team member, any forms, any files
    const hasJobs   = Array.isArray(jobRows)  && jobRows.length  > 0;
    const hasFleet  = Array.isArray(fleetRows) && fleetRows.length > 0;
    const hasTeam   = Array.isArray(teamRows)  && teamRows.length > 1; // >1 means someone besides owner
    const hasForms  = Array.isArray(formRows)  && formRows.length > 0;
    const hasFiles  = Array.isArray(fileRows)  && fileRows.length > 0;

    const isSetup = hasJobs || hasFleet || hasTeam || hasForms || hasFiles;

    res.json({ isSetup, debug: { hasJobs, hasFleet, hasTeam, hasForms, hasFiles } });
  } catch (error) {
    console.error('GET /api/dashboard/setup-check error:', error);
    // Fail safe — return false so we don't show wrong banner
    res.json({ isSetup: false });
  }
}
