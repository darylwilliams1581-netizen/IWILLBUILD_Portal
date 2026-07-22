/**
 * POST /api/owner-console/form-templates
 * Installs (or re-installs) the default form templates for a company.
 * Access enforced by requirePlatformOwner middleware in entry.ts.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { installFormTemplates } from '../../../lib/seed-starter-pack.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });
    // Platform developer check handled by requirePlatformOwner middleware

    const { companyId, force } = req.body as { companyId?: number; force?: boolean };
    if (!companyId || typeof companyId !== 'number') {
      return res.status(400).json({ error: 'companyId is required' });
    }

    // Verify company exists
    const [companyRows] = await db.execute(
      sql`SELECT id, name FROM companies WHERE id = ${companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number; name: string }>, unknown];

    if (!companyRows?.length) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const { result, errors } = await installFormTemplates(companyId, Boolean(force));

    console.log(`[owner-console] form-templates install: company=${companyId} by=${session.user.email} force=${force} result=${result}`);

    return res.json({
      ok: errors.length === 0,
      company: companyRows[0],
      result,
      errors,
    });
  } catch (err) {
    console.error('POST /api/owner-console/form-templates error:', err);
    return res.status(500).json({ error: 'Failed to install form templates' });
  }
}
