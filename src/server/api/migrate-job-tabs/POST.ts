import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];
  try {
    // job_todos
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS job_todos (
          id INT PRIMARY KEY AUTO_INCREMENT,
          job_id INT NOT NULL,
          company_id INT NOT NULL,
          title VARCHAR(255) NOT NULL,
          due_date VARCHAR(20),
          status VARCHAR(30) NOT NULL DEFAULT 'Open',
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
        )
      `);
      results.push('job_todos: OK');
    } catch (e) { results.push(`job_todos: ${String(e)}`); }

    // job_progress_lines
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS job_progress_lines (
          id INT PRIMARY KEY AUTO_INCREMENT,
          job_id INT NOT NULL,
          company_id INT NOT NULL,
          estimate_line_id INT,
          description TEXT NOT NULL,
          quantity VARCHAR(30) NOT NULL DEFAULT '1',
          unit VARCHAR(50),
          rate VARCHAR(30) NOT NULL DEFAULT '0',
          percent_complete INT NOT NULL DEFAULT 0,
          progress_note TEXT,
          assignment_type VARCHAR(20) NULL,
          assigned_to_name VARCHAR(255) NULL,
          contractor_id INT NULL,
          trade_type VARCHAR(100) NULL,
          start_date DATE NULL,
          end_date DATE NULL,
          sort_order INT NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
          INDEX idx_progress_company_job_order (company_id, job_id, sort_order, id)
        )
      `);
      results.push('job_progress_lines: OK');
    } catch (e) { results.push(`job_progress_lines: ${String(e)}`); }

    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ error: String(err), results });
  }
}
