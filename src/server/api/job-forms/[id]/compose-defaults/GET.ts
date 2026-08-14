/** GET /api/job-forms/:id/compose-defaults — returns pre-filled compose fields for the email modal. */
import type { Request, Response } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../../../db/client.js';
import { formTemplates, jobFormSubmissions, jobs, profiles } from '../../../../db/schema.js';
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

    const submissionId = Number(req.params.id);
    if (!Number.isInteger(submissionId)) return res.status(400).json({ error: 'Invalid form ID' });

    const submission = await db.query.jobFormSubmissions.findFirst({
      where: and(
        eq(jobFormSubmissions.id, submissionId),
        eq(jobFormSubmissions.companyId, profile.companyId),
      ),
    });
    if (!submission) return res.status(404).json({ error: 'Form submission not found' });

    const template = await db.query.formTemplates.findFirst({
      where: eq(formTemplates.id, submission.templateId),
    });
    const templateName = template?.name ?? 'Form';

    let jobName = '';
    let jobNumber = '';
    let customerEmail = '';
    let customerName = '';
    if (submission.jobId) {
      const job = await db.query.jobs.findFirst({ where: eq(jobs.id, submission.jobId) });
      if (job) {
        jobName = job.name ?? '';
        jobNumber = (job as Record<string, unknown>).jobNumber as string ?? '';
        // Try to get customer email via join
        const [custRows] = await db.execute(sql`
          SELECT c.name AS customer_name, c.email AS customer_email
          FROM jobs j
          LEFT JOIN customers c ON c.id = j.customer_id AND c.company_id = j.company_id
          WHERE j.id = ${submission.jobId} AND j.company_id = ${profile.companyId}
          LIMIT 1
        `) as unknown as [Array<Record<string, string>>, unknown];
        customerEmail = String(custRows?.[0]?.customer_email ?? '');
        customerName = String(custRows?.[0]?.customer_name ?? '');
      }
    }

    const [companyRows] = await db.execute(sql`
      SELECT name FROM companies WHERE id = ${profile.companyId} LIMIT 1
    `) as unknown as [Array<{ name?: string }>, unknown];
    const companyName = String(companyRows?.[0]?.name ?? 'IWILLBUILD');

    const jobLabel = [jobNumber, jobName].filter(Boolean).join(' – ');
    const status = submission.status === 'completed' ? 'Completed' : 'In Progress';
    const completedAt = new Date(
      (submission.updatedAt ?? submission.createdAt ?? Date.now()) as string | number
    ).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

    const subject = `${templateName}${jobLabel ? ` – ${jobLabel}` : ''} (${status}) | ${companyName}`;
    const message = [
      `Hi${customerName ? ` ${customerName}` : ''},`,
      '',
      `Please find the completed form attached.`,
      '',
      `Form: ${templateName}`,
      `Status: ${status}`,
      ...(jobLabel ? [`Job: ${jobLabel}`] : []),
      `Completed by: ${submission.completedByName ?? 'Unknown'}`,
      `Date: ${completedAt}`,
      '',
      `Please don't hesitate to contact us if you have any questions.`,
      '',
      `Kind regards,`,
      companyName,
    ].join('\n');

    return res.json({
      to: customerEmail,
      subject,
      message,
    });
  } catch (error) {
    console.error('GET /api/job-forms/:id/compose-defaults error:', error);
    return res.status(500).json({ error: 'Failed to load compose defaults' });
  }
}
