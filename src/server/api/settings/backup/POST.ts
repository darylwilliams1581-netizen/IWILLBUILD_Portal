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

    const { config } = req.body as { config: unknown };
    if (!config) return res.status(400).json({ error: 'No config provided' });

    const json = JSON.stringify(config);

    // Upsert into company_settings
    await db.execute(sql`
      INSERT INTO company_settings (companyId, backup_json)
      VALUES (${companyId}, ${json})
      ON DUPLICATE KEY UPDATE backup_json = ${json}
    `);

    return res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/settings/backup error:', e);
    return res.status(500).json({ error: 'Failed to save backup settings' });
  }
}
