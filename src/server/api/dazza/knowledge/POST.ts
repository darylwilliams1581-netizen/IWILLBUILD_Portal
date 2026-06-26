/**
 * POST /api/dazza/knowledge
 * Creates a new knowledge entry for the authenticated user's company.
 * Admin/owner only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

const VALID_CATEGORIES = [
  'Company procedure',
  'Safety / WHS',
  'Estimating',
  'Forms',
  'Fleet',
  'Building standards',
  'Custom',
];

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const role = profile.role ?? 'worker';
    const isAdmin = role === 'owner' || role === 'admin' || profile.permAdmin === true;
    if (!isAdmin) return res.status(403).json({ error: 'Admin/owner only' });

    const { title, category, content, source_name, active } = req.body as {
      title?: string;
      category?: string;
      content?: string;
      source_name?: string;
      active?: boolean;
    };

    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    if (!content?.trim()) return res.status(400).json({ error: 'Content is required' });
    const cat = VALID_CATEGORIES.includes(category ?? '') ? (category ?? 'Company procedure') : 'Company procedure';
    const activeVal = active !== false ? 1 : 0;
    const createdBy = session.user.name ?? session.user.email ?? 'Unknown';
    const sourceName = source_name?.trim() ?? null;

    const [result] = await db.execute(
      sql`INSERT INTO dazza_knowledge (company_id, title, category, content, source_name, active, created_by)
          VALUES (${profile.companyId}, ${title.trim()}, ${cat}, ${content.trim()}, ${sourceName}, ${activeVal}, ${createdBy})`
    ) as unknown as [{ insertId: number }, unknown];

    const insertId = (result as unknown as { insertId: number }).insertId;

    const [rows] = await db.execute(
      sql`SELECT id, title, category, content, source_name, active, created_by, created_at, updated_at
          FROM dazza_knowledge WHERE id = ${insertId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ entry: rows?.[0] ?? null });
  } catch (e) {
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  }
}
