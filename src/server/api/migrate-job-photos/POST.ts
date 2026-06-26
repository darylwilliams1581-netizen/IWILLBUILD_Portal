import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS job_photos (
        id INT PRIMARY KEY AUTO_INCREMENT,
        job_id INT NOT NULL,
        company_id INT NOT NULL,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255),
        label VARCHAR(255),
        mime_type VARCHAR(100),
        size_bytes INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      )
    `);
    results.push('job_photos table created (or already exists)');
  } catch (e: unknown) {
    results.push(`job_photos: ${String(e)}`);
  }
  res.json({ ok: true, results });
}
