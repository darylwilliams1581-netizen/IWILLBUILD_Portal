/**
 * POST /api/migrate-dazza-audit
 * Creates the dazza_audit_log table if it doesn't exist.
 * Safe to run multiple times.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

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
    if (profile?.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS dazza_audit_log (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        user_id           VARCHAR(36) NOT NULL,
        company_id        INT NOT NULL,
        question_summary  VARCHAR(500) NOT NULL,
        modules_used      VARCHAR(255) NOT NULL DEFAULT '',
        dollars_included  TINYINT(1) NOT NULL DEFAULT 0,
        support_mode      TINYINT(1) NOT NULL DEFAULT 0,
        support_company_id INT NULL,
        created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    res.json({ ok: true, message: 'dazza_audit_log table ready' });
  } catch (error) {
    console.error('migrate-dazza-audit error:', error);
    res.status(500).json({ error: String(error) });
  }
}
