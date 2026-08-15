/**
 * POST /api/jobs/:id/send-email
 * Sends a job update email composed in the SendDocumentEmailModal.
 *
 * Body: {
 *   to:        string[]
 *   cc?:       string[]
 *   bcc?:      string[]
 *   subject:   string
 *   message:   string
 *   attachPdf: boolean   (ignored — jobs have no PDF; accepted for modal compat)
 *   bccOwner:  boolean
 * }
 */
import type { Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../../../db/client.js';
import { profiles, user } from '../../../../db/schema.js';
import { sendEmail } from '../../../../email.js';
import { getAuth } from '../../../../../lib/auth/auth.js';

const MAX_SUBJECT = 200;
const MAX_MESSAGE = 4000;
const SYSTEM_FOOTER = 'This email was sent automatically from IWILLBUILD. Please do not reply.';

function isValidEmail(addr: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr.trim());
}

function dedupeLC(addrs: string[]): string[] {
  const seen = new Set<string>();
  return addrs.filter((a) => {
    const k = a.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function toLines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string').map((s) => s.trim()).filter(Boolean);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] ?? char));
}

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

    // Resolve sender name
    const authorUser = await db.query.user.findFirst({ where: eq(user.id, session.user.id) });
    const senderName = authorUser?.name ?? session.user.email ?? 'Unknown';

    const jobId = Number(req.params.id);
    if (!Number.isInteger(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    // Verify job belongs to this company
    const [jobRows] = await db.execute(sql`
      SELECT j.id, j.job_number, j.name
      FROM jobs j
      WHERE j.id = ${jobId} AND j.company_id = ${profile.companyId}
      LIMIT 1
    `) as unknown as [Array<{ id: number; job_number?: string; name: string }>, unknown];

    if (!jobRows?.length) return res.status(404).json({ error: 'Job not found' });

    // Parse + validate body
    const body = req.body as Record<string, unknown>;
    const toList   = dedupeLC(toLines(body.to));
    const ccList   = dedupeLC(toLines(body.cc));
    const bccList  = dedupeLC(toLines(body.bcc));
    const subject  = typeof body.subject === 'string' ? body.subject.trim().slice(0, MAX_SUBJECT) : '';
    const message  = typeof body.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE) : '';
    const bccOwner = body.bccOwner === true;

    if (toList.length === 0) return res.status(400).json({ error: 'At least one recipient required.' });
    for (const addr of [...toList, ...ccList, ...bccList]) {
      if (!isValidEmail(addr)) return res.status(400).json({ error: `Invalid email address: ${addr}` });
    }
    if (!subject) return res.status(400).json({ error: 'Subject is required.' });
    if (!message) return res.status(400).json({ error: 'Message is required.' });

    // Resolve owner email for BCC
    let ownerBcced = false;
    if (bccOwner) {
      const [ownerRows] = await db.execute(sql`
        SELECT u.email FROM user u
        INNER JOIN profiles p ON p.user_id = u.id
        WHERE p.company_id = ${profile.companyId} AND p.role = 'owner'
        LIMIT 1
      `) as unknown as [Array<{ email?: string }>, unknown];
      const ownerEmail = ownerRows?.[0]?.email?.trim();
      if (ownerEmail && isValidEmail(ownerEmail) && !bccList.map((e) => e.toLowerCase()).includes(ownerEmail.toLowerCase())) {
        bccList.push(ownerEmail);
        ownerBcced = true;
      }
    }

    // Build HTML body
    const htmlLines = message
      .split('\n')
      .map((line) => line.trim() === '' ? '<br>' : `<p style="margin:0 0 8px 0">${escapeHtml(line)}</p>`)
      .join('\n');

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
  ${htmlLines}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="font-size:12px;color:#6b7280;margin:0">${escapeHtml(SYSTEM_FOOTER)}</p>
</body>
</html>`;

    const result = await sendEmail({
      to: toList,
      cc: ccList.length ? ccList : undefined,
      bcc: bccList.length ? bccList : undefined,
      subject,
      html: htmlBody,
      text: `${message}\n\n---\n${SYSTEM_FOOTER}`,
    });

    const messageId = result.messageId ?? `job-${jobId}-${Date.now()}`;

    // ── Create audit note ──────────────────────────────────────────────────────
    try {
      const jobRow = jobRows[0];
      const jobLabel = [String(jobRow.job_number ?? ''), String(jobRow.name ?? '')].filter(Boolean).join(' — ');
      const toStr = toList.join(', ');
      const ccStr = ccList.length ? ccList.join(', ') : 'None';
      const bccStr = ownerBcced ? 'Owner' : 'None';
      const bodyPreview = message.length > 120 ? `${message.slice(0, 117)}…` : message;
      const now = new Date().toLocaleString('en-AU', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Brisbane',
      });
      const noteBody = [
        'Email sent – Job correspondence',
        `To: ${toStr}`, `Cc: ${ccStr}`, `BCC: ${bccStr}`,
        `Sent by: ${senderName}`, now,
        `Subject: ${subject}`, `Body: ${bodyPreview}`,
        'Attachment: None', 'Status: Accepted', `Ref: ${messageId}`,
      ].join(' | ');

      const authorIdEsc = session.user.id.replace(/'/g, "''");
      const authorNameEsc = senderName.replace(/'/g, "''");
      const bodyEsc = noteBody.replace(/'/g, "''");
      const labelEsc = jobLabel.replace(/'/g, "''");

      await db.execute(sql.raw(
        `INSERT INTO entity_notes (company_id, entity_type, entity_id, entity_label, note_type, body, author_user_id, author_name, mentions_json)
         VALUES (${profile.companyId}, 'job', ${jobId}, '${labelEsc}', 'note', '${bodyEsc}', '${authorIdEsc}', '${authorNameEsc}', '[]')`
      ));
    } catch (noteErr) {
      console.warn('POST /api/jobs/:id/send-email — note creation failed (non-fatal):', noteErr);
    }

    return res.json({ ok: true, messageId, attachedPdf: false, ownerBcced, senderName });
  } catch (error) {
    console.error('POST /api/jobs/:id/send-email error:', error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}
