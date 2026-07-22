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

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const isOwner = profile.role === 'owner';
    const isAdmin = isOwner || profile.role === 'admin' || profile.permAdmin === true;
    const canInvoices = isAdmin || profile.permInvoices !== false;
    if (!canInvoices) return res.status(403).json({ error: 'No invoice permission' });

    const id = Number(req.params.id);
    const [rows] = await db.execute(sql`
      SELECT i.*,
             j.name as job_name, j.job_number, j.address as job_address,
             j.client as job_client,
             c.name as customer_name, c.contact_person as customer_contact,
             c.email as customer_email, c.phone as customer_phone,
             c.address as customer_address, c.abn as customer_abn
      FROM invoices i
      LEFT JOIN jobs j ON j.id = i.job_id AND j.company_id = i.company_id
      LEFT JOIN customers c ON c.id = i.customer_id AND c.company_id = i.company_id
      WHERE i.id = ${id} AND i.company_id = ${profile.companyId}
      LIMIT 1
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!rows?.length) return res.status(404).json({ error: 'Invoice not found' });

    const [lineRows] = await db.execute(
      sql`SELECT * FROM invoice_lines WHERE invoice_id = ${id} ORDER BY sort_order ASC, id ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const [paymentRows] = await db.execute(
      sql`SELECT * FROM invoice_payments WHERE invoice_id = ${id} ORDER BY payment_date ASC, id ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ invoice: { ...rows[0], lines: lineRows ?? [], payments: paymentRows ?? [] } });
  } catch (err) {
    console.error('GET /api/invoices/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
}
