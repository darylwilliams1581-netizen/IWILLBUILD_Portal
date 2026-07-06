import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const sp = await getSessionAndProfile(req, res);
  if (!sp) return;
  const { session, profile } = sp;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  const { title, severity, location, description, action_owner_id, due_date } = req.body as {
    title?: string; severity?: string; location?: string; description?: string;
    action_owner_id?: string; due_date?: string;
  };
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

  try {
    const [check] = await db.execute(sql`SELECT id FROM am_inspections WHERE id = ${id} AND company_id = ${profile.companyId}`) as unknown as [unknown[], unknown];
    if (!(check as unknown[]).length) return res.status(404).json({ error: 'Inspection not found' });

    const [result] = await db.execute(sql`
      INSERT INTO am_defects (inspection_id, company_id, title, severity, location, description, action_owner_id, due_date, status, created_by)
      VALUES (${id}, ${profile.companyId}, ${title.trim()}, ${severity || 'med'},
              ${location?.trim() || null}, ${description?.trim() || null},
              ${action_owner_id || null}, ${due_date || null}, 'open', ${session.user.id})
    `) as unknown as [{ insertId: number }, unknown];

    await db.execute(sql`INSERT INTO am_audit_log (entity_type, entity_id, action, actor_id) VALUES ('defect', ${result.insertId}, 'created', ${session.user.id})`);

    const [rows] = await db.execute(sql`SELECT * FROM am_defects WHERE id = ${result.insertId}`) as unknown as [unknown[], unknown];
    return res.status(201).json({ defect: (rows as Record<string, unknown>[])[0] });
  } catch (err) {
    console.error('POST defect error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
