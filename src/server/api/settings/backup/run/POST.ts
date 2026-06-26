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

    // Load backup config
    const [rows] = await db.execute(sql`
      SELECT backup_json FROM company_settings WHERE companyId = ${companyId} LIMIT 1
    `) as unknown as [Array<{ backup_json: string | null }>];

    const config = rows?.[0]?.backup_json ? JSON.parse(rows[0].backup_json) : null;
    if (!config?.connectionUrl) {
      return res.status(400).json({ error: 'No backup destination configured. Please save your settings first.' });
    }

    // Record the backup attempt timestamp
    await db.execute(sql`
      INSERT INTO company_settings (companyId, last_backup_at)
      VALUES (${companyId}, NOW())
      ON DUPLICATE KEY UPDATE last_backup_at = NOW()
    `);

    // NOTE: Full SharePoint/OneDrive OAuth integration requires Microsoft Azure app registration.
    // This endpoint records the run and returns success. The actual file transfer
    // will be implemented when Microsoft OAuth credentials are configured.
    return res.json({
      ok: true,
      message: 'Backup run recorded. Full SharePoint/OneDrive transfer requires Microsoft OAuth setup.',
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('POST /api/settings/backup/run error:', e);
    return res.status(500).json({ error: 'Backup failed' });
  }
}
