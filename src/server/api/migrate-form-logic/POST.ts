import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  try {
    // Add logic_json column to form_template_fields if it doesn't exist
    const [rows] = await db.execute(sql`
      SELECT COUNT(*) as cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'form_template_fields'
        AND COLUMN_NAME = 'logic_json'
    `);
    const count = (rows as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0;

    if (Number(count) === 0) {
      await db.execute(sql`
        ALTER TABLE form_template_fields
        ADD COLUMN logic_json TEXT NULL AFTER settings_json
      `);
      return res.json({ ok: true, message: 'logic_json column added' });
    }

    res.json({ ok: true, message: 'logic_json column already exists' });
  } catch (error) {
    console.error('migrate-form-logic error:', error);
    res.status(500).json({ error: String(error) });
  }
}
