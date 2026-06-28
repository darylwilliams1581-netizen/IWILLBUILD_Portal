/**
 * GET /api/settings/backup-destination
 * Returns the saved backup destination settings for the company.
 */
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

    const [rows] = await db.execute(sql`
      SELECT backup_destination_json FROM company_settings WHERE company_id = ${companyId} LIMIT 1
    `) as unknown as [Array<{ backup_destination_json: string | null }>];

    const raw = rows?.[0]?.backup_destination_json;
    const destination = raw ? JSON.parse(raw) : null;

    return res.json({ destination });
  } catch (e) {
    console.error('GET /api/settings/backup-destination error:', e);
    return res.status(500).json({ error: 'Failed to load backup destination' });
  }
}
