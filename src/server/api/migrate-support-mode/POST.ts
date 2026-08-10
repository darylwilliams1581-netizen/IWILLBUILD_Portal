import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];

  // support_audit_events table
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS support_audit_events (
        id INT PRIMARY KEY AUTO_INCREMENT,
        owner_user_id VARCHAR(36) NOT NULL,
        target_company_id INT NOT NULL,
        action_type VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100),
        entity_id VARCHAR(100),
        summary TEXT,
        metadata_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    results.push('support_audit_events table ready');
  } catch (e) {
    results.push(`support_audit_events: ${String(e)}`);
  }

  // setup_checklist_json column on companies
  try {
    const [rows] = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'companies'
        AND COLUMN_NAME = 'setup_checklist_json'
    `);
    const cnt = ((rows as unknown as [Array<{ cnt: number }>, unknown])[0])[0]?.cnt ?? 0;
    if (cnt === 0) {
      await db.execute(sql`ALTER TABLE companies ADD COLUMN setup_checklist_json TEXT`);
      results.push('Added setup_checklist_json to companies');
    } else {
      results.push('setup_checklist_json already exists');
    }
  } catch (e) {
    results.push(`setup_checklist_json: ${String(e)}`);
  }

  res.json({ ok: true, results });
}
