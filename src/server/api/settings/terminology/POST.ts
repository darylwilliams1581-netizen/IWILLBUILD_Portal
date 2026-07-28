import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';

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
    if (!['owner', 'admin'].includes(profile.role ?? '')) return res.status(403).json({ error: 'Owner/Admin only' });

    const { singular, plural } = req.body as { singular?: string; plural?: string };
    if (!singular?.trim() || !plural?.trim()) {
      return res.status(400).json({ error: 'singular and plural are required' });
    }

    const companyId = Number(profile.companyId);
    const s = singular.trim().slice(0, 60).replace(/'/g, "\\'");
    const p = plural.trim().slice(0, 60).replace(/'/g, "\\'");

    // Ensure row exists
    const [existRows] = await db.execute(
      sql`SELECT company_id FROM company_settings WHERE company_id = ${companyId} LIMIT 1`
    ) as unknown as [Array<{ company_id: number }>, unknown];

    if (!existRows || existRows.length === 0) {
      await db.execute(sql`INSERT INTO company_settings (company_id) VALUES (${companyId})`);
    }

    await db.execute(sql.raw(
      `UPDATE company_settings SET work_label_singular = '${s}', work_label_plural = '${p}', updated_at = NOW() WHERE company_id = ${companyId}`
    ));

    res.json({ ok: true, singular: singular.trim(), plural: plural.trim() });
  } catch (error) {
    console.error('POST /api/settings/terminology error:', error);
    res.status(500).json({ error: 'Failed to save terminology' });
  }
}
