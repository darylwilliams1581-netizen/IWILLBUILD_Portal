/** GET /api/estimates/:id/compose-defaults — returns pre-filled compose fields for the email modal. */
import type { Request, Response } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../../../db/client.js';
import { estimates, profiles } from '../../../../db/schema.js';
import { buildEstimatePdfDocument } from '../../../../lib/estimate-pdf-document.js';
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

    const estimateId = Number(req.params.id);
    if (!Number.isInteger(estimateId)) return res.status(400).json({ error: 'Invalid estimate ID' });

    const document = await buildEstimatePdfDocument(profile.companyId, estimateId);
    if (!document) return res.status(404).json({ error: 'Estimate not found' });

    const [companyRows] = await db.execute(sql`
      SELECT name FROM companies WHERE id = ${profile.companyId} LIMIT 1
    `) as unknown as [Array<{ name?: string }>, unknown];
    const companyName = String(companyRows?.[0]?.name ?? 'IWIllBUILD');

    const total = document.total.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
    const recipientName = document.customerName ? ` ${document.customerName}` : '';

    // Fetch job details for the context card
    const estimate = await db.query.estimates.findFirst({
      where: and(eq(estimates.id, estimateId), eq(estimates.companyId, profile.companyId)),
      columns: { jobId: true },
    });
    let jobNumber = '';
    let jobName = '';
    let jobAddress = '';
    if (estimate?.jobId) {
      const [jobRows] = await db.execute(sql`
        SELECT job_number, name, address FROM jobs WHERE id = ${estimate.jobId} AND company_id = ${profile.companyId} LIMIT 1
      `) as unknown as [Array<Record<string, unknown>>, unknown];
      const jr = jobRows?.[0];
      if (jr) {
        jobNumber = String(jr.job_number ?? '');
        jobName = String(jr.name ?? '');
        jobAddress = String(jr.address ?? '');
      }
    }

    const subject = `Quote #${document.estimateId} – ${document.estimateTitle} | ${companyName}`;
    const message = [
      `Hi${recipientName},`,
      '',
      `Please find your quote attached.`,
      '',
      `Quote: #${document.estimateId}`,
      `Title: ${document.estimateTitle}`,
      `Total: ${total}`,
      '',
      `Please don't hesitate to contact us if you have any questions.`,
      '',
      `Kind regards,`,
      companyName,
    ].join('\n');

    return res.json({
      to: document.customerEmail || '',
      subject,
      message,
      job: {
        jobNumber,
        jobName,
        jobAddress,
        clientName: document.customerName ?? '',
        docLabel: `Quote #${document.estimateId}`,
        docDetail: `${document.estimateTitle} · ${total}`,
      },
    });
  } catch (error) {
    console.error('GET /api/estimates/:id/compose-defaults error:', error);
    return res.status(500).json({ error: 'Failed to load compose defaults' });
  }
}
