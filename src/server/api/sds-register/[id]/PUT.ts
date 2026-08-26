/**
 * PUT /api/sds-register/:id
 * ─────────────────────────────────────────────────────────────────────────────
 * Update metadata (title, productName, manufacturer, notes) for an SDS entry.
 * Admin/owner only. Company-scoped.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

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

    const isAdmin = profile.role === 'owner' || profile.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

    const entryId = parseInt(req.params['id'] as string, 10);
    if (isNaN(entryId)) return res.status(400).json({ error: 'Invalid ID' });

    // Verify ownership
    const [existing] = await db.execute(sql.raw(`
      SELECT id FROM sds_register WHERE id = ${entryId} AND company_id = ${profile.companyId} LIMIT 1
    `)) as unknown as [Array<Record<string, unknown>>];
    if (!existing[0]) return res.status(404).json({ error: 'SDS entry not found' });

    const { title, productName, manufacturer, notes } = req.body as {
      title?: string; productName?: string; manufacturer?: string; notes?: string;
    };

    const sets: string[] = [];
    if (title !== undefined) sets.push(`title = ${JSON.stringify(title.trim().slice(0, 255))}`);
    if (productName !== undefined) sets.push(`product_name = ${productName.trim() ? JSON.stringify(productName.trim()) : 'NULL'}`);
    if (manufacturer !== undefined) sets.push(`manufacturer = ${manufacturer.trim() ? JSON.stringify(manufacturer.trim()) : 'NULL'}`);
    if (notes !== undefined) sets.push(`notes = ${notes.trim() ? JSON.stringify(notes.trim()) : 'NULL'}`);

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    await db.execute(sql.raw(`
      UPDATE sds_register SET ${sets.join(', ')} WHERE id = ${entryId} AND company_id = ${profile.companyId}
    `));

    const [rows] = await db.execute(sql.raw(`
      SELECT s.*, u.name AS uploaderName
      FROM sds_register s
      LEFT JOIN user u ON u.id = s.uploaded_by_user_id
      WHERE s.id = ${entryId}
    `)) as unknown as [Array<Record<string, unknown>>];

    return res.json({ entry: rows[0] ?? null });
  } catch (err) {
    console.error('PUT /api/sds-register/:id error:', err);
    return res.status(500).json({ error: 'Failed to update SDS entry' });
  }
}
