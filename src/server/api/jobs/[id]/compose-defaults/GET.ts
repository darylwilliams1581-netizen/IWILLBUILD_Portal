/** GET /api/jobs/:id/compose-defaults — pre-filled email compose fields for a job. */
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

    const jobId = Number(req.params.id);
    if (!Number.isInteger(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const [rows] = await db.execute(sql`
      SELECT
        j.id, j.job_number, j.name, j.status, j.address,
        c.name  AS customer_name,
        c.email AS customer_email
      FROM jobs j
      LEFT JOIN customers c ON c.id = j.customer_id AND c.company_id = j.company_id
      WHERE j.id = ${jobId} AND j.company_id = ${profile.companyId}
      LIMIT 1
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!rows?.length) return res.status(404).json({ error: 'Job not found' });
    const row = rows[0];

    const [companyRows] = await db.execute(sql`
      SELECT name FROM companies WHERE id = ${profile.companyId} LIMIT 1
    `) as unknown as [Array<{ name?: string }>, unknown];
    const companyName = String(companyRows?.[0]?.name ?? 'IWIIlBUILD');

    const jobNumber  = String(row.job_number  ?? '');
    const jobName    = String(row.name        ?? '');
    const jobAddress = String(row.address     ?? '');
    const status     = String(row.status      ?? '');
    const clientName = String(row.customer_name  ?? '');
    const clientEmail = String(row.customer_email ?? '');

    const jobLabel = [jobNumber, jobName].filter(Boolean).join(' \u2014 ');

    const subject = `Job Update: ${jobLabel} | ${companyName}`;
    const message = [
      `Hi${clientName ? ` ${clientName}` : ''},`,
      '',
      `Please find below an update regarding your job.`,
      '',
      ...(jobNumber ? [`Job Number: ${jobNumber}`] : []),
      `Job Name: ${jobName}`,
      ...(status ? [`Status: ${status}`] : []),
      ...(jobAddress ? [`Site Address: ${jobAddress}`] : []),
      '',
      `Please don't hesitate to contact us if you have any questions.`,
      '',
      `Kind regards,`,
      companyName,
    ].join('\n');

    return res.json({
      to: clientEmail,
      subject,
      message,
      job: {
        jobNumber,
        jobName,
        jobAddress,
        clientName,
        docLabel: jobLabel || 'Job',
        docDetail: status,
      },
    });
  } catch (error) {
    console.error('GET /api/jobs/:id/compose-defaults error:', error);
    return res.status(500).json({ error: 'Failed to load compose defaults' });
  }
}
