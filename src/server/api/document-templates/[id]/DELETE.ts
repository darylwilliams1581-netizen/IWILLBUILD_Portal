/**
 * DELETE /api/document-templates/:id
 * Delete a document template (admin/owner only).
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, session.user.id)).limit(1);
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const role = profile.role ?? 'member';
    if (!['owner', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Only admins and owners can delete document templates' });
    }

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    await db.execute(sql.raw(
      `DELETE FROM document_templates WHERE id = ${id} AND company_id = ${profile.companyId}`
    ));

    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/document-templates/:id error:', err);
    return res.status(500).json({ error: 'Failed to delete template' });
  }
}
