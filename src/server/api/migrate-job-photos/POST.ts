import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];

  // Ensure base table exists
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
    results.push('job_photos table: OK');
  } catch (e: unknown) {
    results.push(`job_photos create: ${String(e)}`);
  }

  // Add uploaded_by_user_id if missing
  try {
    const rows = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'job_photos'
        AND COLUMN_NAME = 'uploaded_by_user_id'
    `);
    const cnt = Number(((rows as unknown as [Array<{ cnt: number }>, unknown])[0])[0]?.cnt ?? 0);
    if (cnt === 0) {
      await db.execute(sql`ALTER TABLE job_photos ADD COLUMN uploaded_by_user_id VARCHAR(36) NULL`);
      results.push('added uploaded_by_user_id');
    } else {
      results.push('uploaded_by_user_id: already exists');
    }
  } catch (e: unknown) {
    results.push(`uploaded_by_user_id: ${String(e)}`);
  }

  // Add uploaded_by_name if missing
  try {
    const rows = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'job_photos'
        AND COLUMN_NAME = 'uploaded_by_name'
    `);
    const cnt = Number(((rows as unknown as [Array<{ cnt: number }>, unknown])[0])[0]?.cnt ?? 0);
    if (cnt === 0) {
      await db.execute(sql`ALTER TABLE job_photos ADD COLUMN uploaded_by_name VARCHAR(255) NULL`);
      results.push('added uploaded_by_name');
    } else {
      results.push('uploaded_by_name: already exists');
    }
  } catch (e: unknown) {
    results.push(`uploaded_by_name: ${String(e)}`);
  }

  res.json({ ok: true, results });
}
