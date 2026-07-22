import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  try {
    // Create table if not exists
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS estimating_takeoff_pads (
        id INT PRIMARY KEY AUTO_INCREMENT,
        company_id INT NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        title VARCHAR(255) NOT NULL DEFAULT '',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_takeoff_company_user (company_id, user_id)
      )
    `);
    res.json({ ok: true, message: 'estimating_takeoff_pads table ready' });
  } catch (err) {
    console.error('migrate-takeoff-pad error:', err);
    res.status(500).json({ error: String(err) });
  }
}
