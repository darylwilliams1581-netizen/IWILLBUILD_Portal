import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS job_form_submissions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        job_id INT NOT NULL,
        company_id INT NOT NULL,
        template_id INT NOT NULL,
        completed_by_user_id VARCHAR(255) NOT NULL,
        completed_by_name VARCHAR(255),
        status VARCHAR(30) NOT NULL DEFAULT 'in_progress',
        answers_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (template_id) REFERENCES form_templates(id) ON DELETE CASCADE
      )
    `);
    results.push('job_form_submissions table: OK');
    res.json({ ok: true, results });
  } catch (error) {
    console.error('migrate-job-forms error:', error);
    res.status(500).json({ ok: false, error: String(error), results });
  }
}
