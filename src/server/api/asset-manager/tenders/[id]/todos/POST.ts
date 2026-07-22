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

  const { title, dueDate, notes } = req.body as Record<string, string | undefined>;
  if (!title?.trim()) return res.status(400).json({ error: 'Title required' });

  try {
    const [check] = await db.execute(sql`SELECT id FROM am_tender_cycles WHERE id = ${tenderId} AND company_id = ${profile.companyId}`) as unknown as [unknown[], unknown];
    if (!(check as unknown[]).length) return res.status(404).json({ error: 'Not found' });

    const safeTitle = title.trim().replace(/'/g, "''");
    const safeDue = dueDate ? `'${dueDate}'` : 'NULL';
    const safeNotes = notes ? `'${notes.replace(/'/g, "''")}'` : 'NULL';

    const [result] = await db.execute(sql.raw(`
      INSERT INTO am_tender_todos (tender_id, company_id, title, due_date, notes, status)
      VALUES (${tenderId}, ${profile.companyId}, '${safeTitle}', ${safeDue}, ${safeNotes}, 'Open')
    `)) as unknown as [{ insertId: number }, unknown];

    const [rows] = await db.execute(sql.raw(`SELECT * FROM am_tender_todos WHERE id = ${result.insertId}`)) as unknown as [unknown[], unknown];
    return res.status(201).json({ todo: (rows as Record<string, unknown>[])[0] });
  } catch (err) {
    console.error('POST tender todo error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
