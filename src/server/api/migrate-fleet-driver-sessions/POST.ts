import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS fleet_driver_sessions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        company_id INT NOT NULL,
        fleet_asset_id INT NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        driver_name VARCHAR(255) NOT NULL,
        start_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        end_at TIMESTAMP NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        source VARCHAR(50) NOT NULL DEFAULT 'dashboard_quick_start',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (fleet_asset_id) REFERENCES fleet_assets(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      )
    `);
    results.push('fleet_driver_sessions: table ready');
  } catch (e) {
    results.push(`fleet_driver_sessions error: ${String(e)}`);
  }

  res.json({ ok: true, results });
}
