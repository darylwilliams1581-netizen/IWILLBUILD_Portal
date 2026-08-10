/**
 * POST /api/job-forms/:id/send-email
 * Sends a plain-text summary of a completed form submission to a given email address.
 * Body: { to: string }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { jobFormSubmissions, formTemplates, formFields, profiles, jobs } from '../../../../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { sendEmail } from '../../../../email.js';

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

    const { to } = req.body as { to?: string };
    if (!to?.trim()) return res.status(400).json({ error: 'Recipient email is required' });

    // Load submission
    const submission = await db.query.jobFormSubmissions.findFirst({
      where: and(
        eq(jobFormSubmissions.id, id),
        eq(jobFormSubmissions.companyId, profile.companyId),
      ),
    });
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    // Load template name
    let templateName = 'Form';
    if (submission.templateId) {
      const tpl = await db.query.formTemplates.findFirst({
        where: eq(formTemplates.id, submission.templateId),
        columns: { name: true },
      });
      if (tpl?.name) templateName = tpl.name;
    }

    // Load fields for labels
    const fieldRows = submission.templateId
      ? await db.query.formFields.findMany({ where: eq(formFields.templateId, submission.templateId), orderBy: [asc(formFields.fieldOrder)] })
      : [];

    // Load job info
    let jobLabel = '';
    if (submission.jobId) {
      const jobRow = await db.query.jobs.findFirst({ where: eq(jobs.id, submission.jobId), columns: { jobNumber: true, name: true } });
      if (jobRow) jobLabel = [jobRow.jobNumber, jobRow.name].filter(Boolean).join(' — ');
    }

    // Parse answers
    let answers: Record<string, unknown> = {};
    try { if (submission.answersJson) answers = JSON.parse(submission.answersJson) as Record<string, unknown>; } catch { /* ignore */ }

    // Build plain-text body
    const lines: string[] = [
      `Form: ${templateName}`,
      `Status: ${submission.status === 'completed' ? 'Completed' : 'In Progress'}`,
      jobLabel ? `Job: ${jobLabel}` : '',
      submission.completedByName ? `Completed by: ${submission.completedByName}` : '',
      submission.updatedAt ? `Date: ${new Date(submission.updatedAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '',
      '',
      '─────────────────────────────',
      '',
    ].filter((l) => l !== undefined);

    for (const field of fieldRows) {
      const skipTypes = ['section', 'instruction', 'instruction_image', 'page_break'];
      if (skipTypes.includes(field.fieldType)) continue;
      const val = answers[String(field.id)];
      const empty = val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0);
      let display = empty ? '(no answer)' : String(val);
      if (Array.isArray(val)) display = val.join(', ');
      if (field.fieldType === 'photo') display = empty ? '(no photo)' : '[Photo attached]';
      if (field.fieldType === 'signature') display = empty ? '(no signature)' : '[Signature captured]';
      if (field.fieldType === 'location') {
        if (!empty && typeof val === 'object' && val !== null && 'lat' in val) {
          const g = val as { lat: number; lng: number; accuracy?: number; address?: string };
          display = g.address ? `${g.address} (${g.lat.toFixed(5)}, ${g.lng.toFixed(5)})` : `${g.lat.toFixed(6)}, ${g.lng.toFixed(6)}`;
        }
      }
      lines.push(`${field.label}${field.required ? ' *' : ''}`);
      lines.push(`  ${display}`);
      lines.push('');
    }

    lines.push('─────────────────────────────');
    lines.push('Sent from IWILLBUILD');

    const htmlLines = lines.map((l) => l === '' ? '<br/>' : `<p style="margin:0 0 4px">${l.replace(/─+/g, '<hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0"/>')}</p>`);

    await sendEmail({
      to: to.trim(),
      subject: `${templateName}${jobLabel ? ' — ' + jobLabel : ''} (${submission.status === 'completed' ? 'Completed' : 'Draft'})`,
      text: lines.join('\n'),
      html: `<div style="font-family:sans-serif;font-size:14px;color:#1e293b;max-width:600px">${htmlLines.join('')}</div>`,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/job-forms/:id/send-email error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to send email' });
  }
}
