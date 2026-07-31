/**
 * GET /api/form-global-lists
 * Returns all global lists for the authenticated company.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;
  const companyId = auth.profile.companyId;

  try {
    const [rows] = await db.execute(sql.raw(
      `SELECT id, name, items, created_at, updated_at
       FROM form_global_lists
       WHERE company_id = ${companyId}
       ORDER BY name ASC`
    )) as unknown as [Array<{ id: number; name: string; items: unknown; created_at: string; updated_at: string }>, unknown];

    const lists = (rows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      items: Array.isArray(r.items) ? r.items : (typeof r.items === 'string' ? JSON.parse(r.items) as string[] : []),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return res.json({ ok: true, lists });
  } catch (err) {
    console.error('GET /api/form-global-lists error:', err);
    return res.status(500).json({ error: 'Failed to fetch global lists' });
  }
}
