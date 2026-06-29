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

    const [rows] = await db.execute(
      sql`SELECT file_transfer_backup_json FROM company_settings WHERE company_id = ${companyId} LIMIT 1`
    );
    const row = (rows as { file_transfer_backup_json?: string }[])[0];
    if (!row || !row.file_transfer_backup_json) {
      return res.json({ settings: null });
    }
    try {
      const settings = JSON.parse(row.file_transfer_backup_json);
      return res.json({ settings });
    } catch {
      return res.json({ settings: null });
    }
  } catch (err) {
    console.error('[file-transfer-backup GET]', err);
    return res.status(500).json({ error: 'Failed to load settings' });
  }
}
