import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });
    if (!['owner', 'admin'].includes(profile.role)) return res.status(403).json({ error: 'Owner/Admin only' });

    const { section, data } = req.body as { section: 'structure' | 'dazza' | 'banner'; data: unknown };
    if (!section || !['structure', 'dazza', 'banner'].includes(section)) {
      return res.status(400).json({ error: 'Invalid section' });
    }

    const jsonStr = JSON.stringify(data ?? {});

    if (section === 'structure') {
      await db.execute(
        sql`INSERT INTO company_settings (company_id, structure_json) VALUES (${profile.companyId}, ${jsonStr})
            ON DUPLICATE KEY UPDATE structure_json = ${jsonStr}, updated_at = NOW()`
      );
    } else if (section === 'dazza') {
      await db.execute(
        sql`INSERT INTO company_settings (company_id, dazza_json) VALUES (${profile.companyId}, ${jsonStr})
            ON DUPLICATE KEY UPDATE dazza_json = ${jsonStr}, updated_at = NOW()`
      );
    } else {
      await db.execute(
        sql`INSERT INTO company_settings (company_id, banner_json) VALUES (${profile.companyId}, ${jsonStr})
            ON DUPLICATE KEY UPDATE banner_json = ${jsonStr}, updated_at = NOW()`
      );
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('PUT /api/company-settings error:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
}
