import type { Request, Response } from 'express';
import { getAuth } from '@/lib/auth/auth';
import { db } from '@/server/db/client';
import { sql } from 'drizzle-orm';
import { resolveEffectiveCompany } from '@/server/lib/dazza-context';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const { companyId } = await resolveEffectiveCompany(req, session.user.id);
    if (!companyId) return res.status(400).json({ error: 'No company' });

    // Gather company data
    const [companyRows] = await db.execute(sql`
      SELECT * FROM companies WHERE id = ${companyId} LIMIT 1
    `) as unknown as [Array<Record<string, unknown>>];

    const [jobRows] = await db.execute(sql`
      SELECT * FROM jobs WHERE company_id = ${companyId}
    `) as unknown as [Array<Record<string, unknown>>];

    const [fleetRows] = await db.execute(sql`
      SELECT * FROM fleet WHERE company_id = ${companyId}
    `) as unknown as [Array<Record<string, unknown>>];

    const [formRows] = await db.execute(sql`
      SELECT * FROM form_submissions WHERE company_id = ${companyId}
    `) as unknown as [Array<Record<string, unknown>>];

    const [profileRows] = await db.execute(sql`
      SELECT id, role, status, phone, companyId FROM profiles WHERE companyId = ${companyId}
    `) as unknown as [Array<Record<string, unknown>>];

    const [estimateRows] = await db.execute(sql`
      SELECT e.* FROM estimates e
      JOIN jobs j ON e.job_id = j.id
      WHERE j.company_id = ${companyId}
    `) as unknown as [Array<Record<string, unknown>>];

    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: session.user.email,
      notice: 'This is a data export from IWILLBUILD Portal. Live data remains securely stored in the portal.',
      company: companyRows?.[0] ?? null,
      jobs: jobRows ?? [],
      fleet: fleetRows ?? [],
      formSubmissions: formRows ?? [],
      estimates: estimateRows ?? [],
      team: profileRows ?? [],
    };

    const filename = `iwillbuild-backup-${new Date().toISOString().slice(0, 10)}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(JSON.stringify(payload, null, 2));
  } catch (e) {
    console.error('GET /api/settings/backup/export error:', e);
    return res.status(500).json({ error: 'Export failed' });
  }
}
