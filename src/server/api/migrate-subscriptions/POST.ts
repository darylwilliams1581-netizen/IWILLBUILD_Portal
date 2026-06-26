import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
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
    if (profile?.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

    async function ensureCol(table: string, col: string, definition: string) {
      const [rows] = await db.execute(sql`
        SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ${table}
          AND COLUMN_NAME = ${col}
      `);
      const cnt = (rows as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0;
      if (cnt === 0) {
        await db.execute(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${definition}`));
      }
    }

    await ensureCol('companies', 'plan',                   "VARCHAR(30) NOT NULL DEFAULT 'trial'");
    await ensureCol('companies', 'subscription_status',    "VARCHAR(30) NOT NULL DEFAULT 'trial'");
    await ensureCol('companies', 'trial_ends_at',          'DATETIME NULL');
    await ensureCol('companies', 'stripe_customer_id',     'VARCHAR(100) NULL');
    await ensureCol('companies', 'stripe_subscription_id', 'VARCHAR(100) NULL');
    await ensureCol('companies', 'stripe_price_id',        'VARCHAR(100) NULL');
    await ensureCol('companies', 'max_users',              'INT NOT NULL DEFAULT 1');

    // Back-fill existing companies: set trial_ends_at = created_at + 14 days
    // Only for rows where trial_ends_at is still NULL
    await db.execute(sql`
      UPDATE companies
      SET trial_ends_at = DATE_ADD(created_at, INTERVAL 14 DAY)
      WHERE trial_ends_at IS NULL
    `);

    res.json({ ok: true, message: 'Subscription columns added and existing companies back-filled.' });
  } catch (error) {
    console.error('migrate-subscriptions error:', error);
    res.status(500).json({ error: String(error) });
  }
}
