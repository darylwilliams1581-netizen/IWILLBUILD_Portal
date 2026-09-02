/**
 * POST /api/purchase-orders/:poId/send-email
 * Generates the PO PDF and sends it via the Airo email gateway.
 *
 * Body: {
 *   to:        string[]
 *   cc?:       string[]
 *   bcc?:      string[]
 *   subject:   string
 *   message:   string
 *   attachPdf: boolean
 *   bccOwner:  boolean
 * }
 *
 * On success:
 *  - Draft → Sent transition (if currently draft)
 *  - Records sent_at, sent_by_user_id, recipient_summary
 *  - Adds one PO audit event via Document Engine
 *  - Adds one Job note
 *
 * On failure:
 *  - Status unchanged
 *  - No audit event or job note
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { profiles, user } from '../../../../db/schema.js';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { resolvePOProfile, requireFinanceAndDollars } from '../../../../lib/po-auth.js';
import { fetchPODetail, updatePO } from '../../../../lib/po-service.js';
import { buildPOPdf } from '../../../../lib/purchase-order-pdf-document.js';
import { sendEmail } from '../../../../email.js';
import {
  ensureDocument,
  logEvent,
} from '../../../../lib/document-engine.js';

const MAX_SUBJECT = 200;
const MAX_MESSAGE = 4000;
const EMAIL_ATTACHMENT_LIMIT = 2 * 1024 * 1024;
const SYSTEM_FOOTER = 'This email was sent automatically from IWIIlBUILD. Please do not reply.';
const MAX_RECIPIENTS = 10;

function isValidEmail(addr: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr.trim());
}

function dedupeLC(addrs: string[]): string[] {
  const seen = new Set<string>();
  return addrs.filter((a) => { const k = a.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

function toLines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string').map((s) => s.trim()).filter(Boolean);
}

function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

export default async function handler(req: Request, res: Response) {
  const profile = await resolvePOProfile(req, res);
  if (!profile) return;
  if (!requireFinanceAndDollars(profile, res)) return;

  const poId = parseInt(String(req.params.poId), 10);
  if (isNaN(poId)) return res.status(400).json({ error: 'Invalid PO ID' });

  try {
    // ── Fetch PO ──────────────────────────────────────────────────────────────
    const po = await fetchPODetail(profile.companyId, poId);
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });

    if (po.status === 'cancelled') {
      return res.status(409).json({ error: 'Cannot send a cancelled purchase order' });
    }

    // ── Parse + validate body ─────────────────────────────────────────────────
    const body = req.body as Record<string, unknown>;
    const toList  = dedupeLC(toLines(body.to));
    const ccList  = dedupeLC(toLines(body.cc));
    const bccList = dedupeLC(toLines(body.bcc));
    const subject   = typeof body.subject === 'string' ? body.subject.trim() : '';
    const message   = typeof body.message === 'string' ? body.message.trim() : '';
    const attachPdf = body.attachPdf !== false;
    const bccOwner  = body.bccOwner  !== false;

    if (toList.length === 0) return res.status(400).json({ error: 'At least one To recipient is required.' });
    const allRecipients = [...toList, ...ccList, ...bccList];
    if (allRecipients.length > MAX_RECIPIENTS) return res.status(400).json({ error: `Maximum ${MAX_RECIPIENTS} recipients allowed.` });
    for (const a of allRecipients) {
      if (!isValidEmail(a)) return res.status(400).json({ error: `"${a}" is not a valid email address.` });
    }
    if (!subject) return res.status(400).json({ error: 'Subject is required.' });
    if (subject.length > MAX_SUBJECT) return res.status(400).json({ error: `Subject must be ${MAX_SUBJECT} characters or fewer.` });
    if (!message) return res.status(400).json({ error: 'Message body is required.' });
    if (message.length > MAX_MESSAGE) return res.status(400).json({ error: `Message must be ${MAX_MESSAGE} characters or fewer.` });

    // ── Generate PDF ──────────────────────────────────────────────────────────
    let pdfResult: Awaited<ReturnType<typeof buildPOPdf>> = null;
    if (attachPdf) {
      pdfResult = await buildPOPdf(profile.companyId, poId);
      if (!pdfResult) return res.status(404).json({ error: 'Could not generate PO PDF' });
      if (pdfResult.pdfBytes.length > EMAIL_ATTACHMENT_LIMIT) {
        return res.status(413).json({ error: 'The PO PDF exceeds the 2 MB email attachment limit.' });
      }
    }

    // ── Resolve company name + sender ─────────────────────────────────────────
    const [companyRows] = await db.execute(sql`
      SELECT name FROM companies WHERE id = ${profile.companyId} LIMIT 1
    `) as unknown as [Array<{ name?: string }>, unknown];
    const companyName = String(companyRows?.[0]?.name ?? 'IWIIlBUILD');

    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    const authorUser = session?.user?.id
      ? await db.query.user.findFirst({ where: eq(user.id, session.user.id) })
      : null;
    const senderName = authorUser?.name ?? session?.user?.email ?? 'Unknown';

    // ── Owner BCC ─────────────────────────────────────────────────────────────
    let ownerBcced = false;
    let finalBcc = [...bccList];
    if (bccOwner) {
      const [ownerRows] = await db.execute(sql`
        SELECT u.email FROM profiles p
        JOIN user u ON u.id = p.user_id
        WHERE p.company_id = ${profile.companyId} AND p.role = 'owner'
        LIMIT 1
      `) as unknown as [Array<{ email?: string }>, unknown];
      const ownerEmail = String(ownerRows?.[0]?.email ?? '').trim();
      if (ownerEmail && isValidEmail(ownerEmail)) {
        const allR = [...toList, ...ccList, ...finalBcc].map((a) => a.toLowerCase());
        if (!allR.includes(ownerEmail.toLowerCase())) {
          finalBcc = dedupeLC([...finalBcc, ownerEmail]);
          ownerBcced = true;
        }
      }
    }

    // ── Build email HTML ──────────────────────────────────────────────────────
    const fullText = `${message}\n\n—\n${SYSTEM_FOOTER}`;
    const escapedMessage = escapeHtml(message).replace(/\n/g, '<br>');
    const poNum = po.po_number;

    const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b">
      <div style="max-width:560px;margin:24px auto">
        <div style="background:#7c3aed;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
          <strong style="font-size:18px">${escapeHtml(companyName)}</strong>
          <div style="font-size:12px;opacity:.85;margin-top:4px">Purchase Order ${escapeHtml(poNum)}</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 12px 12px">
          <p style="white-space:pre-line">${escapedMessage}</p>
        </div>
        <div style="background:#f1f5f9;padding:12px 24px">
          <p style="margin:0;font-size:11px;color:#94a3b8;font-style:italic">${escapeHtml(SYSTEM_FOOTER)}</p>
        </div>
      </div>
    </body></html>`;

    // ── Send ──────────────────────────────────────────────────────────────────
    const result = await sendEmail({
      to: toList,
      cc: ccList.length ? ccList : undefined,
      bcc: finalBcc.length ? finalBcc : undefined,
      subject,
      text: fullText,
      html,
      fromName: companyName,
      attachments: attachPdf && pdfResult
        ? [{ filename: pdfResult.filename, content: Buffer.from(pdfResult.pdfBytes), contentType: 'application/pdf' }]
        : undefined,
    });

    // ── On success: transition draft → sent, record audit ────────────────────
    const wasDraft = po.status === 'draft';
    if (wasDraft) {
      try {
        await updatePO({
          companyId: profile.companyId,
          userId: profile.userId,
          poId,
          status: 'sent',
        });
      } catch (transErr) {
        console.warn('[po-send-email] Draft→Sent transition failed (non-fatal):', transErr);
      }
    }

    // Record sent_at + recipient summary (best-effort column update)
    try {
      const recipientSummary = `To: ${toList.join(', ')}${ccList.length ? ` | Cc: ${ccList.join(', ')}` : ''}`;
      await db.execute(sql`
        UPDATE job_purchase_orders SET
          sent_at = NOW(),
          sent_by_user_id = ${profile.userId},
          recipient_summary = ${recipientSummary.slice(0, 500)}
        WHERE id = ${poId} AND company_id = ${profile.companyId}
      `);
    } catch (colErr) {
      // Columns may not exist yet on older schema — non-fatal
      console.warn('[po-send-email] sent_at update failed (non-fatal, columns may be missing):', colErr);
    }

    // Document Engine audit event
    try {
      const docId = await ensureDocument({
        companyId: profile.companyId,
        jobId: po.job_id,
        sourceModule: 'purchase_order',
        sourceId: String(poId),
        documentType: po.assigned_to_type === 'internal' ? 'work_order' : 'purchase_order',
        title: po.title,
        status: wasDraft ? 'sent' : po.status,
        createdByUserId: profile.userId,
      });
      await logEvent(docId, profile.companyId, 'sent', {
        eventNote: `Purchase order emailed to ${toList.join(', ')} by ${senderName}. Ref: ${result.messageId}`,
        userId: profile.userId,
      });
    } catch (docErr) {
      console.warn('[po-send-email] Document audit event failed (non-fatal):', docErr);
    }

    // Job note
    try {
      const toStr = toList.join(', ');
      const ccStr = ccList.length ? ccList.join(', ') : 'None';
      const bccStr = ownerBcced ? 'Owner' : 'None';
      const bodyPreview = message.length > 120 ? `${message.slice(0, 117)}…` : message;
      const now = new Date().toLocaleString('en-AU', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Brisbane',
      });
      const noteBody = [
        `Email sent – Purchase Order ${poNum}`,
        `To: ${toStr}`, `Cc: ${ccStr}`, `BCC: ${bccStr}`,
        `Sent by: ${senderName}`, now,
        `Subject: ${subject}`, `Body: ${bodyPreview}`,
        `Attachment: ${attachPdf ? 'PO PDF' : 'None'}`,
        'Status: Accepted', `Ref: ${result.messageId}`,
      ].join(' | ');

      const authorIdEsc   = profile.userId.replace(/'/g, "''");
      const authorNameEsc = senderName.replace(/'/g, "''");
      const bodyEsc       = noteBody.replace(/'/g, "''");
      const companyNameEsc = companyName.replace(/'/g, "''");

      await db.execute(sql.raw(
        `INSERT INTO entity_notes (company_id, entity_type, entity_id, entity_label, note_type, body, author_user_id, author_name, mentions_json)
         VALUES (${profile.companyId}, 'job', ${po.job_id}, '${companyNameEsc}', 'note', '${bodyEsc}', '${authorIdEsc}', '${authorNameEsc}', '[]')`
      ));
    } catch (noteErr) {
      console.warn('[po-send-email] Job note creation failed (non-fatal):', noteErr);
    }

    return res.json({
      ok: true,
      messageId: result.messageId,
      attachedPdf: attachPdf,
      ownerBcced,
      senderName,
      transitionedToSent: wasDraft,
    });
  } catch (err) {
    console.error('POST /api/purchase-orders/:poId/send-email error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
}
