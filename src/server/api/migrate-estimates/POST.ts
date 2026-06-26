import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS estimates (
        id INT PRIMARY KEY AUTO_INCREMENT,
        job_id INT NOT NULL,
        company_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        status VARCHAR(60) NOT NULL DEFAULT 'Draft',
        markup_percent VARCHAR(20) NOT NULL DEFAULT '0',
        gst_mode VARCHAR(30) NOT NULL DEFAULT 'No GST',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      )
    `);
    results.push('estimates: table ready');
  } catch (e) {
    results.push(`estimates error: ${String(e)}`);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS estimate_lines (
        id INT PRIMARY KEY AUTO_INCREMENT,
        estimate_id INT NOT NULL,
        description TEXT NOT NULL,
        quantity VARCHAR(30) NOT NULL DEFAULT '1',
        unit VARCHAR(50),
        rate VARCHAR(30) NOT NULL DEFAULT '0',
        line_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
      )
    `);
    results.push('estimate_lines: table ready');
  } catch (e) {
    results.push(`estimate_lines error: ${String(e)}`);
  }

  res.json({ ok: true, results });
}
