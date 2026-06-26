import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];

  // Add last_login_at to profiles
  try {
    const [rows] = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'profiles'
        AND COLUMN_NAME = 'last_login_at'
    `);
    const cnt = (rows as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0;
    if (cnt === 0) {
      await db.execute(sql`ALTER TABLE profiles ADD COLUMN last_login_at TIMESTAMP NULL`);
      results.push('Added last_login_at to profiles');
    } else {
      results.push('last_login_at already exists');
    }
  } catch (e) {
    results.push(`last_login_at: ${String(e)}`);
  }

  // Add last_active_at to profiles
  try {
    const [rows] = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'profiles'
        AND COLUMN_NAME = 'last_active_at'
    `);
    const cnt = (rows as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0;
    if (cnt === 0) {
      await db.execute(sql`ALTER TABLE profiles ADD COLUMN last_active_at TIMESTAMP NULL`);
      results.push('Added last_active_at to profiles');
    } else {
      results.push('last_active_at already exists');
    }
  } catch (e) {
    results.push(`last_active_at: ${String(e)}`);
  }

  // Create user_activity_events table
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_activity_events (
        id INT PRIMARY KEY AUTO_INCREMENT,
        company_id INT NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        metadata_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    results.push('user_activity_events table ready');
  } catch (e) {
    results.push(`user_activity_events: ${String(e)}`);
  }

  res.json({ ok: true, results });
}
