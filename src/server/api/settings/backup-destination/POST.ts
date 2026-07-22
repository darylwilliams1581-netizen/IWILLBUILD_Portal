/**
 * POST /api/settings/backup-destination
 * Saves backup destination settings for the company.
 * Admin/Owner only.
 *
 * Body: { destination: BackupDestination }
 */
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

    // Admin/Owner only
    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile || !['owner', 'admin'].includes(profile.role)) {
      return res.status(403).json({ error: 'Admin or Owner access required' });
    }

    const { destination } = req.body as { destination: unknown };
    if (!destination) return res.status(400).json({ error: 'No destination provided' });

    const json = JSON.stringify(destination);

    await db.execute(sql`
      INSERT INTO company_settings (company_id, backup_destination_json)
      VALUES (${companyId}, ${json})
      ON DUPLICATE KEY UPDATE backup_destination_json = ${json}
    `);

    return res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/settings/backup-destination error:', e);
    return res.status(500).json({ error: 'Failed to save backup destination' });
  }
}
