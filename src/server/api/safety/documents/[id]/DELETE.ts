/**
 * DELETE /api/safety/documents/:id
 * Hard-deletes a safety document (company-scoped).
 *
 * NOTE: safety_documents is NOT a Secure Share target.
 * ShareLinkModal is never invoked for safety documents, so there are no
 * secure_share_links rows to revoke.  revokeSharesForSource() is intentionally
 * NOT called here — calling it with targetType='document' would incorrectly
 * attempt to revoke DocumentBuilder (documents table) shares for a safety
 * document ID, which is a different table with unrelated IDs.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
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

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    // Verify ownership before deleting
    const [rows] = await db.execute(
      sql`SELECT id FROM safety_documents WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number }>, unknown];
    if (!rows?.length) return res.status(404).json({ error: 'Document not found' });

    await db.execute(
      sql`DELETE FROM safety_documents WHERE id = ${id} AND company_id = ${profile.companyId}`
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/safety/documents/:id error:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
}
