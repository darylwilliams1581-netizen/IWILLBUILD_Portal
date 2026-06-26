/**
 * PUT /api/dazza/knowledge/:id
 * Updates a knowledge entry. Admin/owner only. Company-scoped.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

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

    const id = parseInt(req.params.id ?? '0', 10);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    // Verify ownership
    const [existing] = await db.execute(
      sql`SELECT id FROM dazza_knowledge WHERE id = ${id} AND company_id = ${profile.companyId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];
    if (!existing?.length) return res.status(404).json({ error: 'Not found' });

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
    const sourceName = source_name?.trim() ?? null;

    await db.execute(
      sql`UPDATE dazza_knowledge
          SET title = ${title.trim()}, category = ${cat}, content = ${content.trim()},
              source_name = ${sourceName}, active = ${activeVal}
          WHERE id = ${id} AND company_id = ${profile.companyId}`
    );

    const [rows] = await db.execute(
      sql`SELECT id, title, category, content, source_name, active, created_by, created_at, updated_at
          FROM dazza_knowledge WHERE id = ${id}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ entry: rows?.[0] ?? null });
  } catch (e) {
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  }
}
