/** Generate the canonical quote PDF and send it as a real attachment. */
import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { sendEmail } from '../../../../email.js';
import { buildEstimatePdfDocument } from '../../../../lib/estimate-pdf-document.js';
import { getAuth } from '../../../../../lib/auth/auth.js';

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
    if (profile.permEstimating === false && profile.role !== 'owner' && profile.role !== 'admin') {
      return res.status(403).json({ error: 'No estimating permission' });
    }

    const estimateId = Number(req.params.id);
    if (!Number.isInteger(estimateId)) return res.status(400).json({ error: 'Invalid quote ID' });

    const document = await buildEstimatePdfDocument(profile.companyId, estimateId);
    if (!document) return res.status(404).json({ error: 'Quote not found' });

    const override = typeof req.body?.to === 'string' ? req.body.to.trim() : '';
    const to = override || document.customerEmail;
    if (!to) return res.status(400).json({ error: 'Enter a recipient email address.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return res.status(400).json({ error: 'Enter a valid recipient email address.' });
    }

    const total = document.total.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
    const recipientName = document.customerName ? ` ${document.customerName}` : '';
    const subject = `Quote #${document.estimateId} - ${document.estimateTitle}`;
    const text = [
      `Hi${recipientName},`, '',
      'Please find your quote attached as a PDF.', '',
      `Quote: #${document.estimateId}`,
      `Title: ${document.estimateTitle}`,
      `Total: ${total}`, '',
      'Please reply to this email if you have any questions.', '',
      'Kind regards,', document.companyName,
    ].join('\n');

    const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b">
      <div style="max-width:560px;margin:24px auto">
        <div style="background:#7c3aed;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
          <strong style="font-size:18px">${escapeHtml(document.companyName)}</strong>
          <div style="font-size:12px;opacity:.85;margin-top:4px">Quote #${document.estimateId}</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
          <p>Hi${escapeHtml(recipientName)},</p>
          <p>Please find your quote attached as a PDF.</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin:18px 0">
            <div><strong>${escapeHtml(document.estimateTitle)}</strong></div>
            <div style="color:#64748b;margin-top:6px">Total: <strong style="color:#7c3aed">${escapeHtml(total)}</strong></div>
          </div>
          <p style="color:#475569">Please reply to this email if you have any questions.</p>
          <p>Kind regards,<br><strong>${escapeHtml(document.companyName)}</strong></p>
        </div>
      </div>
    </body></html>`;

    await sendEmail({
      to,
      subject,
      text,
      html,
      fromName: document.companyName,
      attachments: [{ filename: document.filename, content: Buffer.from(document.pdfBytes), contentType: 'application/pdf' }],
    });

    return res.json({ ok: true, to, attachment: document.filename });
  } catch (error) {
    console.error('POST /api/estimates/:id/send-email error:', error);
    const message = error instanceof Error ? error.message : 'Failed to send quote email';
    return res.status(500).json({ error: message });
  }
}
