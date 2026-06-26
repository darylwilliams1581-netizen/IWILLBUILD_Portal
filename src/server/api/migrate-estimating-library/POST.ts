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

  await tryExec('Create cost_guide_items', `
    CREATE TABLE IF NOT EXISTS cost_guide_items (
      id INT PRIMARY KEY AUTO_INCREMENT,
      company_id INT NOT NULL,
      description VARCHAR(255) NOT NULL,
      unit VARCHAR(50),
      rate VARCHAR(30) NOT NULL DEFAULT '0',
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )
  `);

  await tryExec('Create recipes', `
    CREATE TABLE IF NOT EXISTS recipes (
      id INT PRIMARY KEY AUTO_INCREMENT,
      company_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      notes TEXT,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )
  `);

  await tryExec('Create recipe_lines', `
    CREATE TABLE IF NOT EXISTS recipe_lines (
      id INT PRIMARY KEY AUTO_INCREMENT,
      recipe_id INT NOT NULL,
      description TEXT NOT NULL,
      quantity VARCHAR(30) NOT NULL DEFAULT '1',
      unit VARCHAR(50),
      rate VARCHAR(30) NOT NULL DEFAULT '0',
      line_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )
  `);

  res.json({ ok: true, results });
}
