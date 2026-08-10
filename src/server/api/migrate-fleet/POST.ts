import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];

  // fleet_assets — drop old table and recreate with new schema
  // We use IF NOT EXISTS + INFORMATION_SCHEMA checks to be safe
  try {
    // Add missing columns to fleet_assets if they exist already
    const [cols] = await db.execute(sql`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fleet_assets'
    `);
    const existing = ((cols as unknown as [Array<{ COLUMN_NAME: string }>, unknown])[0]).map((c) => c.COLUMN_NAME);

    if (!existing.includes('asset_number')) {
      await db.execute(sql`ALTER TABLE fleet_assets ADD COLUMN asset_number VARCHAR(50)`);
      results.push('fleet_assets: added asset_number');
    }
    if (!existing.includes('make_model')) {
      await db.execute(sql`ALTER TABLE fleet_assets ADD COLUMN make_model VARCHAR(255)`);
      results.push('fleet_assets: added make_model');
    }
    if (!existing.includes('rego_not_applicable')) {
      await db.execute(sql`ALTER TABLE fleet_assets ADD COLUMN rego_not_applicable TINYINT(1) NOT NULL DEFAULT 0`);
      results.push('fleet_assets: added rego_not_applicable');
    }
    if (!existing.includes('archived')) {
      await db.execute(sql`ALTER TABLE fleet_assets ADD COLUMN archived TINYINT(1) NOT NULL DEFAULT 0`);
      results.push('fleet_assets: added archived');
    }
    // Widen rego column if it exists
    if (existing.includes('rego')) {
      await db.execute(sql`ALTER TABLE fleet_assets MODIFY COLUMN rego VARCHAR(50)`);
      results.push('fleet_assets: widened rego to VARCHAR(50)');
    }
    // Update status default
    if (existing.includes('status')) {
      await db.execute(sql`ALTER TABLE fleet_assets MODIFY COLUMN status VARCHAR(60) NOT NULL DEFAULT 'Active'`);
      results.push('fleet_assets: updated status column');
    }
    // Add type default
    if (existing.includes('type')) {
      await db.execute(sql`ALTER TABLE fleet_assets MODIFY COLUMN type VARCHAR(100) NOT NULL DEFAULT 'Vehicle'`);
      results.push('fleet_assets: updated type column');
    }
    results.push('fleet_assets: schema up to date');
  } catch (e) {
    results.push(`fleet_assets migration error: ${String(e)}`);
  }

  // fleet_prestarts — create if not exists
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS fleet_prestarts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        asset_id INT NOT NULL,
        company_id INT NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        operator_name VARCHAR(255),
        km_hours VARCHAR(50),
        safe_to_operate TINYINT(1) NOT NULL DEFAULT 1,
        issue_needs_attention TINYINT(1) NOT NULL DEFAULT 0,
        issue_comment TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (asset_id) REFERENCES fleet_assets(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      )
    `);
    results.push('fleet_prestarts: table ready');
  } catch (e) {
    results.push(`fleet_prestarts error: ${String(e)}`);
  }

  res.json({ ok: true, results });
}
