import type { Request, Response } from 'express';
import { getAuth } from '@/lib/auth/auth';
import { db } from '@/server/db/client';
import { profiles } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
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

    // Owner/Admin only
    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile || (profile.role !== 'owner' && profile.role !== 'admin')) {
      return res.status(403).json({ error: 'Only Owners and Admins can update backup settings' });
    }

    const { settings } = req.body as { settings?: unknown };
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings payload' });
    }

    const json = JSON.stringify(settings);

    await db.execute(
      sql`INSERT INTO company_settings (company_id, file_transfer_backup_json, updated_at)
          VALUES (${companyId}, ${json}, NOW())
          ON DUPLICATE KEY UPDATE
            file_transfer_backup_json = ${json},
            updated_at = NOW()`
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[file-transfer-backup POST]', err);
    return res.status(500).json({ error: 'Failed to save settings' });
  }
}
