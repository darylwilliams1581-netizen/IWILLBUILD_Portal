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

    const isOwner = profile.role === 'owner';
    const isAdmin = isOwner || profile.role === 'admin' || profile.permAdmin === true;
    if (!isAdmin && !profile.permInvoices) return res.status(403).json({ error: 'No invoice permission' });

    const id = Number(req.params.id);
    const [rows] = await db.execute(
      sql`SELECT id, status FROM invoices WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number; status: string }>, unknown];
    if (!rows?.length) return res.status(404).json({ error: 'Invoice not found' });
    if (rows[0].status === 'void') return res.status(400).json({ error: 'Cannot mark a void invoice as sent' });

    await db.execute(
      sql`UPDATE invoices SET status = 'sent' WHERE id = ${id} AND company_id = ${profile.companyId}`
    );

    const [updated] = await db.execute(
      sql`SELECT * FROM invoices WHERE id = ${id}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];
    res.json({ invoice: updated?.[0] ?? null });
  } catch (err) {
    console.error('POST /api/invoices/:id/mark-sent error:', err);
    res.status(500).json({ error: 'Failed to mark sent' });
  }
}
