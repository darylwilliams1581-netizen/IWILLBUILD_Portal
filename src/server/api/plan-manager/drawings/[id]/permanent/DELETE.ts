/**
 * DELETE /api/plan-manager/drawings/:id/permanent
 * Hard-delete a drawing. Requires explicit confirmation in body: { confirm: "DELETE" }
 * Only works on archived drawings (must archive first).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
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

    // Require admin/owner role
    const [roleRows] = await db.execute(sql`
      SELECT role FROM profiles WHERE user_id = ${session.user.id} AND company_id = ${profile.companyId} LIMIT 1
    `) as unknown as [Array<{ role: string }>];
    const role = roleRows?.[0]?.role ?? '';
    if (!['admin', 'owner'].includes(role)) {
      return res.status(403).json({ error: 'Admin or owner role required for permanent deletion' });
    }

    const { confirm } = req.body as { confirm?: string };
    if (confirm !== 'DELETE') {
      return res.status(400).json({ error: 'Must send { confirm: "DELETE" } to permanently delete' });
    }

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const [rows] = await db.execute(sql`
      SELECT id FROM project_drawings WHERE id = ${id} AND company_id = ${profile.companyId} AND status = 'archived' LIMIT 1
    `) as unknown as [Array<{ id: number }>];
    if (!rows?.length) return res.status(404).json({ error: 'Drawing not found or must be archived first' });

    // Cascade delete
    await db.execute(sql`DELETE FROM drawing_annotations WHERE drawing_id = ${id}`);
    await db.execute(sql`DELETE FROM drawing_revisions WHERE drawing_id = ${id}`);
    await db.execute(sql`DELETE FROM drawing_share_tokens WHERE drawing_id = ${id}`);
    await db.execute(sql`DELETE FROM job_drawing_links WHERE drawing_id = ${id}`);
    await db.execute(sql`DELETE FROM drawing_audit_log WHERE drawing_id = ${id}`);
    await db.execute(sql`DELETE FROM project_drawings WHERE id = ${id}`);

    res.json({ ok: true, deleted: id });
  } catch (err) {
    console.error('DELETE permanent error:', err);
    res.status(500).json({ error: 'Failed to delete drawing' });
  }
}
