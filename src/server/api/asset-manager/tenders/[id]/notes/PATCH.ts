/**
 * PATCH /api/asset-manager/tenders/:id/notes
 * Saves the notes field on a tender.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { profile } = sp;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const { notes } = req.body as { notes?: string };

  try {
    const [check] = await db.execute(sql`SELECT id FROM am_tender_cycles WHERE id = ${id} AND company_id = ${profile.companyId}`) as unknown as [unknown[], unknown];
    if (!(check as unknown[]).length) return res.status(404).json({ error: 'Not found' });

    const safeNotes = notes ? `'${notes.replace(/'/g, "''")}'` : 'NULL';
    await db.execute(sql.raw(`UPDATE am_tender_cycles SET notes = ${safeNotes}, updated_at = NOW() WHERE id = ${id}`));

    return res.json({ ok: true });
  } catch (err) {
    console.error('PATCH tender notes error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
