import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles } from '../../db/schema.js';
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
    if (!profile?.companyId) return res.json({ invoices: [] });

    const isOwner = profile.role === 'owner';
    const isAdmin = isOwner || profile.role === 'admin' || profile.permAdmin === true;
    const canInvoices = isAdmin || profile.permInvoices !== false;
    if (!canInvoices) return res.status(403).json({ error: 'No invoice permission' });

    const jobId = req.query.jobId ? Number(req.query.jobId) : null;
    const status = req.query.status as string | undefined;

    let query = sql`
      SELECT i.*,
             j.name as job_name, j.job_number,
             c.name as customer_name
      FROM invoices i
      LEFT JOIN jobs j ON j.id = i.job_id AND j.company_id = i.company_id
      LEFT JOIN customers c ON c.id = i.customer_id AND c.company_id = i.company_id
      WHERE i.company_id = ${profile.companyId}
    `;
    if (jobId) query = sql`${query} AND i.job_id = ${jobId}`;
    if (status && status !== 'all') query = sql`${query} AND i.status = ${status}`;
    query = sql`${query} ORDER BY i.created_at DESC`;

    const [rows] = await db.execute(query) as unknown as [Array<Record<string, unknown>>, unknown];
    res.json({ invoices: rows ?? [] });
  } catch (err) {
    console.error('GET /api/invoices error:', err);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
}
