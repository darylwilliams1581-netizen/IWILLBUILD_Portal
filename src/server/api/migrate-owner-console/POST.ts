import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

async function ensureColumn(table: string, column: string, definition: string, results: string[]) {
  try {
    const [rows] = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ${table}
        AND COLUMN_NAME = ${column}
    `);
    const cnt = (rows as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0;
    if (cnt === 0) {
      await db.execute(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`));
      results.push(`Added ${column} to ${table}`);
    } else {
      results.push(`${column} already exists on ${table}`);
    }
  } catch (e) {
    results.push(`${table}.${column}: ${String(e)}`);
  }
}

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];

  await ensureColumn('profiles', 'notification_prefs', 'TEXT', results);
  await ensureColumn('profiles', 'last_login_at', 'TIMESTAMP NULL', results);
  await ensureColumn('profiles', 'last_active_at', 'TIMESTAMP NULL', results);

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
