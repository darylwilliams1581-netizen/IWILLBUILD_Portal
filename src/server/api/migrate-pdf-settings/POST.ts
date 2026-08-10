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

    // Add pdf_json column if it doesn't exist
    const cols = await db.execute(
      sql`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'company_settings'
          AND COLUMN_NAME = 'pdf_json'`
    ) as unknown as [Array<{ COLUMN_NAME: string }>, unknown];

    const exists = Array.isArray(cols[0]) && (cols[0] as Array<unknown>).length > 0;
    if (!exists) {
      await db.execute(sql`ALTER TABLE company_settings ADD COLUMN pdf_json LONGTEXT NULL`);
    }

    res.json({ ok: true, created: !exists });
  } catch (error) {
    console.error('migrate-pdf-settings error:', error);
    res.status(500).json({ error: String(error) });
  }
}
