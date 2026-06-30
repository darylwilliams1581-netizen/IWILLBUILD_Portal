/**
 * GET /api/documents/share/:token
 * ─────────────────────────────────────────────────────────────────────────────
 * Public endpoint — no login required.
 * Validates a document share token and returns the document content.
 *
 * Security:
 * - Token hashed before lookup — raw token never stored
 * - Checks expiry, revocation, max_uses
 * - Returns ONLY the specific document — no company-wide data
 * - No financial data unless shareMode explicitly allows it
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { resolveShare, logEvent } from '../../../../lib/document-engine.js';

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params as { token: string };
    if (!token || token.length < 20) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    const result = await resolveShare(token);

    if (!result) {
      return res.status(404).json({ error: 'Link not found or has expired.' });
    }
    if ('error' in result) {
      return res.status(410).json({ error: result.error });
    }

    const { share, document } = result;

    // Log the view event
    await logEvent(document.id, document.companyId, 'viewed', {
      ipAddress: req.ip ?? null,
    });

    // Fetch document-type-specific content
    const content = await fetchDocumentContent(document.documentType, document.sourceModule, document.sourceId, document.companyId, share.shareMode);

    return res.json({
      document: {
        id: document.id,
        documentType: document.documentType,
        title: document.title,
        status: document.status,
        version: document.version,
        isLocked: document.isLocked,
        completedAt: document.completedAt,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      },
      share: {
        id: share.id,
        shareMode: share.shareMode,
        expiresAt: share.expiresAt,
        submittedAt: share.submittedAt,
      },
      content,
    });
  } catch (err) {
    console.error('GET /api/documents/share/:token error:', err);
    res.status(500).json({ error: 'Failed to load document' });
  }
}

async function fetchDocumentContent(
  documentType: string,
  sourceModule: string,
  sourceId: string,
  companyId: number,
  shareMode: string,
): Promise<Record<string, unknown>> {
  const id = parseInt(sourceId, 10);
  if (isNaN(id)) return {};

  if (documentType === 'job_form' || documentType === 'completed_form') {
    // Form submission — no financial data
    const [subRows] = await db.execute(
      sql`SELECT jfs.id, jfs.job_id, jfs.template_id, jfs.status, jfs.answers_json,
                 jfs.submitted_at, jfs.external_submitter_name, jfs.external_submitter_email,
                 jfs.created_at, jfs.updated_at,
                 ft.name as template_name, ft.description as template_description,
                 j.name as job_name, j.job_number,
                 c.name as company_name
          FROM job_form_submissions jfs
          JOIN form_templates ft ON ft.id = jfs.template_id
          JOIN jobs j ON j.id = jfs.job_id
          JOIN companies c ON c.id = jfs.company_id
          WHERE jfs.id = ${id} AND jfs.company_id = ${companyId}
          LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const submission = subRows?.[0];
    if (!submission) return {};

    const [fieldRows] = await db.execute(
      sql`SELECT id, field_type, label, required, options_json, sort_order, page_number,
                 conditional_logic_json, instruction_text, instruction_image_url
          FROM form_fields
          WHERE template_id = ${submission.template_id as number}
          ORDER BY sort_order ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    return { submission, fields: fieldRows ?? [] };
  }

  if (documentType === 'estimate') {
    const [rows] = await db.execute(
      sql`SELECT e.id, e.title, e.status, e.total, e.gst_total, e.grand_total,
                 e.notes, e.created_at, e.updated_at,
                 j.name as job_name, j.job_number,
                 c.name as company_name
          FROM estimates e
          LEFT JOIN jobs j ON j.id = e.job_id
          JOIN companies c ON c.id = e.company_id
          WHERE e.id = ${id} AND e.company_id = ${companyId}
          LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const estimate = rows?.[0];
    if (!estimate) return {};

    // Only include dollar amounts if shareMode allows
    const includeFinancials = shareMode === 'view' || shareMode === 'download';

    const [lineRows] = await db.execute(
      sql`SELECT id, description, quantity, unit, rate, amount, sort_order
          FROM estimate_lines
          WHERE estimate_id = ${id}
          ORDER BY sort_order ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!includeFinancials) {
      // Strip financial data
      const safeEstimate = { ...estimate };
      delete safeEstimate.total;
      delete safeEstimate.gst_total;
      delete safeEstimate.grand_total;
      const safeLines = (lineRows ?? []).map((l) => {
        const sl = { ...l };
        delete sl.rate;
        delete sl.amount;
        return sl;
      });
      return { estimate: safeEstimate, lines: safeLines };
    }

    return { estimate, lines: lineRows ?? [] };
  }

  if (documentType === 'purchase_order' || documentType === 'work_order') {
    const [rows] = await db.execute(
      sql`SELECT po.id, po.po_number, po.title, po.status, po.instructions,
                 po.start_date, po.finish_date, po.subtotal, po.gst, po.total,
                 po.cancelled_note, po.created_at, po.updated_at,
                 j.name as job_name, j.job_number,
                 c.name as company_name
          FROM job_purchase_orders po
          JOIN jobs j ON j.id = po.job_id
          JOIN companies c ON c.id = po.company_id
          WHERE po.id = ${id} AND po.company_id = ${companyId}
          LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const po = rows?.[0];
    if (!po) return {};

    const [lineRows] = await db.execute(
      sql`SELECT id, description, qty, unit, rate, amount, sort_order
          FROM job_purchase_order_lines
          WHERE purchase_order_id = ${id}
          ORDER BY sort_order ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    return { purchaseOrder: po, lines: lineRows ?? [] };
  }

  if (documentType === 'invoice') {
    // Only show invoice if shareMode is view/download
    if (shareMode !== 'view' && shareMode !== 'download') {
      return { error: 'Financial documents require explicit share permission.' };
    }

    const [rows] = await db.execute(
      sql`SELECT i.id, i.invoice_number, i.title, i.status, i.issue_date, i.due_date,
                 i.subtotal, i.gst_amount, i.total, i.amount_paid, i.balance_due,
                 i.notes, i.terms, i.created_at, i.updated_at,
                 j.name as job_name, j.job_number,
                 c.name as company_name
          FROM invoices i
          LEFT JOIN jobs j ON j.id = i.job_id
          JOIN companies c ON c.id = i.company_id
          WHERE i.id = ${id} AND i.company_id = ${companyId}
          LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const invoice = rows?.[0];
    if (!invoice) return {};

    const [lineRows] = await db.execute(
      sql`SELECT id, description, quantity, unit, rate, amount, sort_order
          FROM invoice_lines
          WHERE invoice_id = ${id}
          ORDER BY sort_order ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    return { invoice, lines: lineRows ?? [] };
  }

  if (documentType === 'swms') {
    const [rows] = await db.execute(
      sql`SELECT js.id, js.title, js.status, js.work_activity, js.hazards, js.risks,
                 js.controls, js.ppe, js.plant_equipment, js.training_competency,
                 js.emergency_controls, js.environmental_controls, js.sign_off_requirements,
                 js.revision_number, js.review_date, js.created_at, js.updated_at,
                 j.name as job_name, j.job_number,
                 c.name as company_name
          FROM job_swms js
          JOIN jobs j ON j.id = js.job_id
          JOIN companies c ON c.id = js.company_id
          WHERE js.id = ${id} AND js.company_id = ${companyId}
          LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const swms = rows?.[0];
    if (!swms) return {};

    const [signoffRows] = await db.execute(
      sql`SELECT id, worker_name, white_card_number, signed_at
          FROM swms_signoffs
          WHERE job_swms_id = ${id}
          ORDER BY signed_at ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    return { swms, signoffs: signoffRows ?? [] };
  }

  return {};
}
