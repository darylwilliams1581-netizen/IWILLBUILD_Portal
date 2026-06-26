import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];
  try {
    // Create table if not exists
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS form_template_fields (
        id INT PRIMARY KEY AUTO_INCREMENT,
        template_id INT NOT NULL,
        company_id INT NOT NULL,
        label VARCHAR(255) NOT NULL DEFAULT '',
        field_type VARCHAR(50) NOT NULL DEFAULT 'short_text',
        required BOOLEAN NOT NULL DEFAULT FALSE,
        options_json TEXT,
        settings_json TEXT,
        field_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (template_id) REFERENCES form_templates(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      )
    `);
    results.push('form_template_fields table: OK');
    res.json({ ok: true, results });
  } catch (error) {
    console.error('migrate-form-fields error:', error);
    res.status(500).json({ ok: false, error: String(error), results });
  }
}
