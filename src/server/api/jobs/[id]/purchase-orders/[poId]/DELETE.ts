/**
 * DELETE /api/jobs/:id/purchase-orders/:poId
 * Deletes a purchase order.
 *
 * Gate 1 hardening:
 *  - Finance permission required (permInvoices)
 *  - Delete permission required (permDeleteRecords or owner/admin)
 *  - PO must match job_id + company_id (wrong-job and cross-company → 404)
 *  - Only Draft POs may be deleted → 409 for any other status
 *  - Active share links are revoked before deletion
 *  - Document record is marked deleted/archived
 */

import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import {
  resolvePOProfile,
  requireFinanceAndDelete,
} from '../../../../../lib/po-auth.js';
import {
  getDocumentBySource,
  updateDocument,
  revokeShare,
  logEvent,
} from '../../../../../lib/document-engine.js';

export default async function handler(req: Request, res: Response) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const profile = await resolvePOProfile(req, res);
  if (!profile) return;
  if (!requireFinanceAndDelete(profile, res)) return;

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

    const { status } = existing[0];

    // Only draft POs may be deleted
    if (status !== 'draft') {
      return res.status(409).json({
        error: `Cannot delete a PO with status '${status}'. Only draft POs can be deleted.`,
      });
    }

    // ── Revoke share links + update Document record (best-effort) ─────────
    try {
      const doc = await getDocumentBySource(
        profile.companyId,
        'purchase_order',
        String(poId),
      );
      if (doc) {
        // Revoke all active share links so external recipients can no longer access
        await revokeShare(doc.id, profile.companyId);
        // Mark document as deleted
        await updateDocument(profile.companyId, doc.id, {
          status: 'deleted',
          updatedByUserId: profile.userId,
        });
        await logEvent(doc.id, profile.companyId, 'status_changed', {
          eventNote: 'Purchase order deleted — all share links revoked',
          userId: profile.userId,
        });
      }
    } catch (docErr) {
      console.warn('[po-gate1] Document revoke/delete failed (non-fatal):', docErr);
    }

    // ── Delete lines then header ──────────────────────────────────────────
    await db.execute(sql`
      DELETE FROM job_purchase_order_lines WHERE purchase_order_id = ${poId}
    `);
    await db.execute(sql`
      DELETE FROM job_purchase_orders
      WHERE id = ${poId}
        AND job_id = ${jobId}
        AND company_id = ${profile.companyId}
    `);

    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/jobs/:id/purchase-orders/:poId error:', err);
    return res.status(500).json({ error: 'Failed to delete purchase order' });
  }
}
