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
      SELECT backup_json FROM company_settings WHERE companyId = ${companyId} LIMIT 1
    `) as unknown as [Array<{ backup_json: string | null }>];

    const raw = rows?.[0]?.backup_json;
    const config = raw ? JSON.parse(raw) : null;

    // Get last backup timestamp
    const [brows] = await db.execute(sql`
      SELECT last_backup_at FROM company_settings WHERE companyId = ${companyId} LIMIT 1
    `) as unknown as [Array<{ last_backup_at: string | null }>];

    return res.json({
      config,
      lastBackup: brows?.[0]?.last_backup_at ?? null,
    });
  } catch (e) {
    console.error('GET /api/settings/backup error:', e);
    return res.status(500).json({ error: 'Failed to load backup settings' });
  }
}
