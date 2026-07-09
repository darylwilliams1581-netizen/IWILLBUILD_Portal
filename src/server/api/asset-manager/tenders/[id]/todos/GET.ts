import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { profile } = sp;
  const tenderId = parseInt(String(req.params.id), 10);
  if (isNaN(tenderId)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const [check] = await db.execute(sql`SELECT id FROM am_tender_cycles WHERE id = ${tenderId} AND company_id = ${profile.companyId}`) as unknown as [unknown[], unknown];
    if (!(check as unknown[]).length) return res.status(404).json({ error: 'Not found' });

    const [rows] = await db.execute(sql.raw(`
      SELECT * FROM am_tender_todos
      WHERE tender_id = ${tenderId} AND company_id = ${profile.companyId}
      ORDER BY due_date ASC, id ASC
    `)) as unknown as [unknown[], unknown];

    return res.json({ todos: rows ?? [] });
  } catch (err) {
    console.error('GET tender todos error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
