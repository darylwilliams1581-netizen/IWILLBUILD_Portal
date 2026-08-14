/** GET /api/invoices/:id/compose-defaults — returns pre-filled compose fields for the email modal. */
import type { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { getAuth } from '../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid invoice ID' });

    const [rows] = await db.execute(sql`
      SELECT i.invoice_number, i.total, i.due_date,
             c.name AS customer_name, c.email AS customer_email
      FROM invoices i
      LEFT JOIN customers c ON c.id = i.customer_id AND c.company_id = i.company_id
      WHERE i.id = ${id} AND i.company_id = ${profile.companyId}
      LIMIT 1
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!rows?.length) return res.status(404).json({ error: 'Invoice not found' });
    const inv = rows[0];

    const [companyRows] = await db.execute(sql`
      SELECT name FROM companies WHERE id = ${profile.companyId} LIMIT 1
    `) as unknown as [Array<{ name?: string }>, unknown];
    const companyName = String(companyRows?.[0]?.name ?? 'IWILLBUILD');

    const invNum = inv.invoice_number ? String(inv.invoice_number) : `#${id}`;
    const customerName = inv.customer_name ? String(inv.customer_name) : '';
    const total = Number(inv.total ?? 0).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
    const dueDate = inv.due_date
      ? new Date(String(inv.due_date)).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
      : '';

    const subject = `Invoice ${invNum}${customerName ? ` – ${customerName}` : ''} | ${companyName}`;
    const message = [
      `Hi${customerName ? ` ${customerName}` : ''},`,
      '',
      `Please find your invoice attached.`,
      '',
      `Invoice No: ${invNum}`,
      ...(total ? [`Amount: ${total}`] : []),
      ...(dueDate ? [`Due Date: ${dueDate}`] : []),
      '',
      `Please don't hesitate to contact us if you have any questions.`,
      '',
      `Kind regards,`,
      companyName,
    ].join('\n');

    // Fetch job details for the context card
    const [jobRows] = await db.execute(sql`
      SELECT j.job_number, j.name AS job_name, j.address AS job_address
      FROM invoices i
      LEFT JOIN jobs j ON j.id = i.job_id AND j.company_id = i.company_id
      WHERE i.id = ${id} AND i.company_id = ${profile.companyId}
      LIMIT 1
    `) as unknown as [Array<Record<string, unknown>>, unknown];
    const jobRow = jobRows?.[0] ?? {};

    return res.json({
      to: String(inv.customer_email ?? ''),
      subject,
      message,
      job: {
        jobNumber: String(jobRow.job_number ?? ''),
        jobName: String(jobRow.job_name ?? ''),
        jobAddress: String(jobRow.job_address ?? ''),
        clientName: customerName,
        docLabel: `Invoice ${invNum}`,
        docDetail: [total, dueDate ? `Due ${dueDate}` : ''].filter(Boolean).join(' · '),
      },
    });
  } catch (error) {
    console.error('GET /api/invoices/:id/compose-defaults error:', error);
    return res.status(500).json({ error: 'Failed to load compose defaults' });
  }
}
