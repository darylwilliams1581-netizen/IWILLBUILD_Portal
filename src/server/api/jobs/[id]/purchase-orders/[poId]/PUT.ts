/**
 * PUT /api/jobs/:id/purchase-orders/:poId
 * Updates a purchase order (status, instructions, dates, cancel note, assignment).
 *
 * Gate 1 hardening:
 *  - Finance permission required (permInvoices)
 *  - PO must match job_id + company_id (wrong-job and cross-company → 404)
 *  - Status transitions validated against ALLOWED_TRANSITIONS
 *  - Invalid status → 422; disallowed transition → 409
 *  - Document record status synced on status change
 *  - logEvent called for status changes
 */

import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import {
  resolvePOProfile,
  requireFinance,
  validateTransition,
  ALLOWED_TRANSITIONS,
} from '../../../../../lib/po-auth.js';
import {
  updateDocument,
  logEvent,
  getDocumentBySource,
} from '../../../../../lib/document-engine.js';

export default async function handler(req: Request, res: Response) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const profile = await resolvePOProfile(req, res);
  if (!profile) return;
  if (!requireFinance(profile, res)) return;

  // ── IDs ───────────────────────────────────────────────────────────────────
  const jobId = parseInt(String(req.params.id), 10);
  if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

  const poId = parseInt(String(req.params.poId), 10);
  if (isNaN(poId)) return res.status(400).json({ error: 'Invalid PO ID' });

  try {
    // Scope by PO id + job_id + company_id
    const [existing] = await db.execute(sql`
      SELECT id, status FROM job_purchase_orders
      WHERE id = ${poId}
        AND job_id = ${jobId}
        AND company_id = ${profile.companyId}
      LIMIT 1
    `) as unknown as [Array<{ id: number; status: string }>, unknown];

    if (!existing?.length) return res.status(404).json({ error: 'Purchase order not found' });

    const currentStatus = existing[0].status;
    const body = req.body as Record<string, unknown>;

    // ── Status transition validation ──────────────────────────────────────
    let newStatus = currentStatus;
    if (body.status !== undefined) {
      const requestedStatus = String(body.status);
      const transitionError = validateTransition(currentStatus, requestedStatus);
      if (transitionError) {
        return res.status(transitionError.code).json({ error: transitionError.message });
      }
      newStatus = requestedStatus;
    }

    // ── Normalise optional fields ─────────────────────────────────────────
    const title = body.title !== undefined
      ? (String(body.title).trim() || null)
      : null;
    const instructions = body.instructions !== undefined
      ? (String(body.instructions).trim() || null)
      : undefined;
    const startDate = body.startDate !== undefined
      ? (String(body.startDate).trim() || null)
      : undefined;
    const finishDate = body.finishDate !== undefined
      ? (String(body.finishDate).trim() || null)
      : undefined;
    const cancelledNote = body.cancelledNote !== undefined
      ? (String(body.cancelledNote).trim() || null)
      : undefined;
    const assignedToName = body.assignedToName !== undefined
      ? (String(body.assignedToName).trim() || null)
      : undefined;
    const tradeType = body.tradeType !== undefined
      ? (String(body.tradeType).trim() || null)
      : undefined;
    const contractorId = body.contractorId !== undefined
      ? (body.contractorId != null ? parseInt(String(body.contractorId), 10) : null)
      : undefined;

    // ── Update ────────────────────────────────────────────────────────────
    await db.execute(sql`
      UPDATE job_purchase_orders SET
        status           = ${newStatus},
        title            = COALESCE(${title}, title),
        instructions     = ${instructions !== undefined ? instructions : sql`instructions`},
        start_date       = ${startDate !== undefined ? startDate : sql`start_date`},
        finish_date      = ${finishDate !== undefined ? finishDate : sql`finish_date`},
        cancelled_note   = ${cancelledNote !== undefined ? cancelledNote : sql`cancelled_note`},
        assigned_to_name = ${assignedToName !== undefined ? assignedToName : sql`assigned_to_name`},
        trade_type       = ${tradeType !== undefined ? tradeType : sql`trade_type`},
        contractor_id    = ${contractorId !== undefined ? contractorId : sql`contractor_id`}
      WHERE id = ${poId}
        AND job_id = ${jobId}
        AND company_id = ${profile.companyId}
    `);

    // ── Document Engine sync (best-effort) ────────────────────────────────
    if (newStatus !== currentStatus) {
      try {
        const doc = await getDocumentBySource(
          profile.companyId,
          'purchase_order',
          String(poId),
        );
        if (doc) {
          await updateDocument(profile.companyId, doc.id, {
            status: newStatus,
            updatedByUserId: profile.userId,
          });
          await logEvent(doc.id, profile.companyId, 'status_changed', {
            eventNote: `Status changed from '${currentStatus}' to '${newStatus}'`,
            userId: profile.userId,
          });
        }
      } catch (docErr) {
        console.warn('[po-gate1] Document status sync failed (non-fatal):', docErr);
      }
    }

    // ── Fetch updated PO ──────────────────────────────────────────────────
    const [poRows] = await db.execute(sql`
      SELECT po.*,
             c.name as contractor_name, c.email as contractor_email,
             c.phone as contractor_phone, c.abn as contractor_abn
      FROM job_purchase_orders po
      LEFT JOIN customers c ON c.id = po.contractor_id
      WHERE po.id = ${poId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    const [lineRows] = await db.execute(sql`
      SELECT * FROM job_purchase_order_lines
      WHERE purchase_order_id = ${poId}
      ORDER BY sort_order ASC
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.json({ purchaseOrder: { ...poRows[0], lines: lineRows ?? [] } });
  } catch (err) {
    console.error('PUT /api/jobs/:id/purchase-orders/:poId error:', err);
    return res.status(500).json({ error: 'Failed to update purchase order' });
  }
}

// Re-export for test assertions
export { ALLOWED_TRANSITIONS };
