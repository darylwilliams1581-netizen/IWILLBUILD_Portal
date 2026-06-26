import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];

  async function tryExec(label: string, query: string) {
    try {
      await db.execute(sql.raw(query));
      results.push(`✅ ${label}`);
    } catch (err) {
      results.push(`⚠️  ${label}: ${String(err)}`);
    }
  }

  await tryExec('Create company_files', `
    CREATE TABLE IF NOT EXISTS company_files (
      id INT PRIMARY KEY AUTO_INCREMENT,
      company_id INT NOT NULL,
      job_id INT NULL,
      fleet_asset_id INT NULL,
      uploaded_by_user_id VARCHAR(36) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      stored_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      size_bytes INT NOT NULL,
      file_category VARCHAR(50) NOT NULL DEFAULT 'Other',
      label VARCHAR(255) NULL,
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL,
      FOREIGN KEY (fleet_asset_id) REFERENCES fleet_assets(id) ON DELETE SET NULL,
      FOREIGN KEY (uploaded_by_user_id) REFERENCES user(id) ON DELETE CASCADE
    )
  `);

  res.json({ ok: true, results });
}
