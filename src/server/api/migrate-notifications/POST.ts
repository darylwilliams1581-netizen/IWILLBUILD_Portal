/**
 * POST /api/migrate-notifications
 * Adds notification_prefs column to profiles table if missing.
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

    // Check if column exists
    const cols = await db.execute(
      sql`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'profiles'
            AND COLUMN_NAME = 'notification_prefs'`
    ) as unknown as Array<{ COLUMN_NAME: string }>;

    if (cols.length === 0) {
      await db.execute(sql`ALTER TABLE profiles ADD COLUMN notification_prefs TEXT NULL`);
    }

    res.json({ ok: true, message: 'notification_prefs column ready' });
  } catch (error) {
    console.error('migrate-notifications error:', error);
    res.status(500).json({ error: String(error) });
  }
}
